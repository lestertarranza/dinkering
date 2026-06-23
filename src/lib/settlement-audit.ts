import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/ledger";
import { formatBookingContext } from "@/lib/booking-context";
import {
  computeWalletAllocations,
  type AllocRow,
  type Allocation,
} from "@/lib/settlement-allocation";

export type SettlementCategory = "court" | "expense";

/** One derived settlement funded by existing credit / group funds (read-only). */
export type AutoSettlement = {
  id: string;
  category: SettlementCategory;
  amount: number;
  date: string;
  payerName: string;
  chargeLabel: string;
  parentId: string;
  fundingLabel: string;
};

export type SettlementAudit = {
  court: AutoSettlement[];
  expense: AutoSettlement[];
  courtTotal: number;
  expenseTotal: number;
};

type ChargeMeta = {
  category: SettlementCategory;
  parentId: string;
  label: string;
  payerName: string;
};

const laterDate = (a: string, b: string) => (a >= b ? a : b);

/**
 * Derive every charge settlement that was funded automatically from a wallet's
 * existing credit / group funds (buyer reimbursements, manual credits, or
 * advance payments) — i.e. settlements that are NOT a fresh payment recorded
 * against that same booking/expense. These have no `payments` row, so this is
 * the only place the money trail surfaces for auditing.
 */
export async function buildAutomaticSettlements(
  db: SupabaseClient,
): Promise<SettlementAudit> {
  const { data: ledger } = await db
    .from("ledger_entries")
    .select(
      "entry_date, created_at, source_type, source_id, debit_amount, credit_amount, player_id, player_group_id",
    )
    .eq("voided", false)
    .order("entry_date")
    .order("created_at");

  const rows = (ledger ?? []) as (AllocRow & {
    player_id: string | null;
    player_group_id: string | null;
  })[];

  // Group by the wallet the ledger entry already belongs to, then run FIFO
  // attribution within each wallet.
  const byWallet = new Map<string, AllocRow[]>();
  for (const r of rows) {
    const key = `${r.player_id ?? ""}|${r.player_group_id ?? ""}`;
    const list = byWallet.get(key) ?? [];
    list.push(r);
    byWallet.set(key, list);
  }

  const allocations: Allocation[] = [];
  for (const list of byWallet.values()) {
    for (const a of computeWalletAllocations(list)) {
      if (
        a.charge_source_type === "booking_share" ||
        a.charge_source_type === "team_expense_share"
      ) {
        allocations.push(a);
      }
    }
  }
  if (allocations.length === 0)
    return { court: [], expense: [], courtTotal: 0, expenseTotal: 0 };

  // Collect ids to enrich in batches.
  const bookingShareIds = new Set<string>();
  const expenseShareIds = new Set<string>();
  const paymentIds = new Set<string>();
  const creditExpenseIds = new Set<string>();
  const manualIds = new Set<string>();
  for (const a of allocations) {
    if (a.charge_source_type === "booking_share")
      bookingShareIds.add(a.charge_source_id);
    else expenseShareIds.add(a.charge_source_id);
    if (a.funding_source_id) {
      if (a.funding_source_type === "payment") paymentIds.add(a.funding_source_id);
      else if (a.funding_source_type === "team_expense_credit")
        creditExpenseIds.add(a.funding_source_id);
      else if (a.funding_source_type === "manual_adjustment")
        manualIds.add(a.funding_source_id);
    }
  }

  const [
    bookingShareRows,
    expenseShareRows,
    paymentRows,
    creditExpenseRows,
    manualRows,
  ] = await Promise.all([
    bookingShareIds.size
      ? db
          .from("booking_shares")
          .select(
            "id, booking_id, players(name), player_groups(name), bookings(booking_code, play_date, start_time, end_time, venue, court_number)",
          )
          .in("id", [...bookingShareIds])
      : Promise.resolve({ data: [] }),
    expenseShareIds.size
      ? db
          .from("team_expense_shares")
          .select(
            "id, team_expense_id, players(name), player_groups(name), team_expenses(expense_code, description)",
          )
          .in("id", [...expenseShareIds])
      : Promise.resolve({ data: [] }),
    paymentIds.size
      ? db
          .from("payments")
          .select("id, payment_code, booking_id, team_expense_id")
          .in("id", [...paymentIds])
      : Promise.resolve({ data: [] }),
    creditExpenseIds.size
      ? db
          .from("team_expenses")
          .select("id, expense_code, description")
          .in("id", [...creditExpenseIds])
      : Promise.resolve({ data: [] }),
    manualIds.size
      ? db
          .from("manual_adjustments")
          .select("id, reason")
          .in("id", [...manualIds])
      : Promise.resolve({ data: [] }),
  ]);

  const chargeMeta = new Map<string, ChargeMeta>();
  for (const s of (bookingShareRows.data ?? []) as unknown as {
    id: string;
    booking_id: string;
    players: { name: string } | null;
    player_groups: { name: string } | null;
    bookings: {
      booking_code: string | null;
      play_date: string;
      start_time: string | null;
      end_time: string | null;
      venue: string | null;
      court_number: string | null;
    } | null;
  }[]) {
    const b = s.bookings;
    const ctx = b ? formatBookingContext(b) : "";
    chargeMeta.set(s.id, {
      category: "court",
      parentId: s.booking_id,
      label: b
        ? `${b.booking_code ?? "Court"}${ctx ? ` · ${ctx}` : ""}`
        : "Court share",
      payerName: s.players?.name ?? s.player_groups?.name ?? "—",
    });
  }
  for (const s of (expenseShareRows.data ?? []) as unknown as {
    id: string;
    team_expense_id: string;
    players: { name: string } | null;
    player_groups: { name: string } | null;
    team_expenses: { expense_code: string | null; description: string } | null;
  }[]) {
    const e = s.team_expenses;
    chargeMeta.set(s.id, {
      category: "expense",
      parentId: s.team_expense_id,
      label: e ? `${e.expense_code ?? "Expense"} · ${e.description}` : "Expense share",
      payerName: s.players?.name ?? s.player_groups?.name ?? "—",
    });
  }

  const paymentMeta = new Map<
    string,
    { code: string | null; booking_id: string | null; team_expense_id: string | null }
  >();
  for (const p of (paymentRows.data ?? []) as unknown as {
    id: string;
    payment_code: string | null;
    booking_id: string | null;
    team_expense_id: string | null;
  }[]) {
    paymentMeta.set(p.id, {
      code: p.payment_code,
      booking_id: p.booking_id,
      team_expense_id: p.team_expense_id,
    });
  }

  const creditExpenseMeta = new Map<string, string>();
  for (const e of (creditExpenseRows.data ?? []) as unknown as {
    id: string;
    expense_code: string | null;
    description: string;
  }[]) {
    creditExpenseMeta.set(e.id, e.expense_code ?? e.description);
  }

  const manualMeta = new Map<string, string>();
  for (const m of (manualRows.data ?? []) as unknown as {
    id: string;
    reason: string;
  }[]) {
    manualMeta.set(m.id, m.reason);
  }

  const court: AutoSettlement[] = [];
  const expense: AutoSettlement[] = [];
  let counter = 0;

  for (const a of allocations) {
    const meta = chargeMeta.get(a.charge_source_id);
    if (!meta) continue;

    // Determine whether this allocation is already represented by a fresh
    // payment tagged to the same booking/expense (a "direct" payment). Those
    // are listed elsewhere as real payment rows, so skip them here.
    let fundingLabel: string;
    if (a.funding_source_type === "payment") {
      const pay = a.funding_source_id ? paymentMeta.get(a.funding_source_id) : null;
      const code = pay?.code ?? "payment";
      const directBooking =
        meta.category === "court" &&
        pay?.booking_id != null &&
        pay.booking_id === meta.parentId;
      const directExpense =
        meta.category === "expense" &&
        pay?.team_expense_id != null &&
        pay.team_expense_id === meta.parentId;
      if (directBooking || directExpense) continue; // shown as a real payment
      const tagged = pay?.booking_id || pay?.team_expense_id;
      fundingLabel = tagged
        ? `from payment ${code}`
        : `from advance credit ${code}`;
    } else if (a.funding_source_type === "team_expense_credit") {
      const label = a.funding_source_id
        ? creditExpenseMeta.get(a.funding_source_id)
        : null;
      fundingLabel = label
        ? `from buyer reimbursement (${label})`
        : "from buyer reimbursement";
    } else if (a.funding_source_type === "manual_adjustment") {
      const reason = a.funding_source_id ? manualMeta.get(a.funding_source_id) : null;
      fundingLabel = reason ? `from manual credit (${reason})` : "from manual credit";
    } else {
      fundingLabel = "from wallet credit";
    }

    const row: AutoSettlement = {
      id: `auto-${counter++}`,
      category: meta.category,
      amount: round2(a.amount),
      date: laterDate(a.charge_date, a.funding_date),
      payerName: meta.payerName,
      chargeLabel: meta.label,
      parentId: meta.parentId,
      fundingLabel,
    };
    if (meta.category === "court") court.push(row);
    else expense.push(row);
  }

  const byDateDesc = (a: AutoSettlement, b: AutoSettlement) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  court.sort(byDateDesc);
  expense.sort(byDateDesc);

  return {
    court,
    expense,
    courtTotal: round2(court.reduce((s, r) => s + r.amount, 0)),
    expenseTotal: round2(expense.reduce((s, r) => s + r.amount, 0)),
  };
}
