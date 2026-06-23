import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/ledger";
import { isSettled } from "@/lib/format";
import { formatBookingContext } from "@/lib/booking-context";
import type { SourceType } from "@/lib/types";

export type OpenCharge = {
  source_type: SourceType;
  source_id: string;
  entry_date: string;
  label: string;
  booking_id: string | null;
  team_expense_id: string | null;
  remaining: number;
};

type Wallet = {
  player_id: string | null;
  player_group_id: string | null;
};

type LedgerRow = {
  entry_date: string;
  created_at: string;
  source_type: SourceType;
  source_id: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
};

const CHARGE_TYPES = new Set<SourceType>([
  "booking_share",
  "team_expense_share",
  "manual_adjustment",
]);

/** Fetch a wallet's non-voided ledger rows, oldest first. */
async function fetchWalletLedger(
  db: SupabaseClient,
  wallet: Wallet,
): Promise<LedgerRow[]> {
  let query = db
    .from("ledger_entries")
    .select(
      "entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount",
    )
    .eq("voided", false)
    .order("entry_date")
    .order("created_at");

  if (wallet.player_group_id) {
    query = query.eq("player_group_id", wallet.player_group_id);
  } else if (wallet.player_id) {
    query = query.eq("player_id", wallet.player_id);
  } else {
    return [];
  }

  const { data } = await query;
  return (data ?? []) as LedgerRow[];
}

/**
 * Apply credits to charges chronologically (FIFO) and return the open charges
 * with their remaining unpaid amounts. Pure computation over ledger rows.
 */
function computeOpenCharges(rows: LedgerRow[]): OpenCharge[] {
  type Pending = OpenCharge & { remaining: number };
  const pending: Pending[] = [];
  let creditPool = 0;

  const applyCredits = () => {
    if (creditPool <= 0) return;
    for (const charge of pending) {
      if (creditPool <= 0 || charge.remaining <= 0) continue;
      const applied = Math.min(charge.remaining, creditPool);
      charge.remaining = round2(charge.remaining - applied);
      creditPool = round2(creditPool - applied);
    }
  };

  for (const row of rows) {
    const debit = Number(row.debit_amount);
    const credit = Number(row.credit_amount);

    if (credit > 0) {
      creditPool = round2(creditPool + credit);
      applyCredits();
      continue;
    }

    if (debit <= 0 || !CHARGE_TYPES.has(row.source_type) || !row.source_id) {
      continue;
    }

    const charge: Pending = {
      source_type: row.source_type,
      source_id: row.source_id,
      entry_date: row.entry_date,
      label: row.description ?? row.source_type,
      booking_id: null,
      team_expense_id: null,
      remaining: debit,
    };
    pending.push(charge);

    if (creditPool > 0) {
      const applied = Math.min(charge.remaining, creditPool);
      charge.remaining = round2(charge.remaining - applied);
      creditPool = round2(creditPool - applied);
    }
  }

  return pending.filter((c) => !isSettled(c.remaining));
}

/**
 * Load unpaid charge items for a wallet, oldest first (FIFO), with friendly
 * labels (booking/expense context). Used for the bulk-payment UI/allocation.
 */
export async function getOpenCharges(
  db: SupabaseClient,
  wallet: Wallet,
): Promise<OpenCharge[]> {
  const rows = await fetchWalletLedger(db, wallet);
  const open = computeOpenCharges(rows);
  await enrichChargeLabels(db, open);
  return open;
}

/**
 * Compute remaining (unpaid) amount for every charge in a wallet, keyed by the
 * ledger source_id. A source_id absent from the map (or ≈0) is fully settled.
 * Skips label enrichment, so it costs a single query (used on detail pages).
 */
export async function chargeRemainingBySource(
  db: SupabaseClient,
  wallet: Wallet,
): Promise<Map<string, number>> {
  const rows = await fetchWalletLedger(db, wallet);
  const open = computeOpenCharges(rows);
  const map = new Map<string, number>();
  for (const c of open) map.set(c.source_id, c.remaining);
  return map;
}

async function enrichChargeLabels(db: SupabaseClient, charges: OpenCharge[]) {
  const bookingShareIds = charges
    .filter((c) => c.source_type === "booking_share")
    .map((c) => c.source_id);
  const expenseShareIds = charges
    .filter((c) => c.source_type === "team_expense_share")
    .map((c) => c.source_id);

  const bookingMeta = new Map<
    string,
    { booking_id: string; label: string }
  >();
  if (bookingShareIds.length) {
    const { data } = await db
      .from("booking_shares")
      .select(
        "id, booking_id, bookings(booking_code, play_date, start_time, end_time, venue, court_number)",
      )
      .in("id", bookingShareIds);
    for (const s of (data ?? []) as unknown as {
      id: string;
      booking_id: string;
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
      bookingMeta.set(s.id, {
        booking_id: s.booking_id,
        label: b
          ? ctx
            ? `Court — ${b.booking_code ?? "booking"} · ${ctx}`
            : `Court — ${b.booking_code ?? "booking"}`
          : "Court share",
      });
    }
  }

  const expenseMeta = new Map<
    string,
    { team_expense_id: string; label: string }
  >();
  if (expenseShareIds.length) {
    const { data } = await db
      .from("team_expense_shares")
      .select(
        "id, team_expense_id, team_expenses(expense_code, description, purchase_date)",
      )
      .in("id", expenseShareIds);
    for (const s of (data ?? []) as unknown as {
      id: string;
      team_expense_id: string;
      team_expenses: {
        expense_code: string | null;
        description: string;
        purchase_date: string;
      } | null;
    }[]) {
      const e = s.team_expenses;
      expenseMeta.set(s.id, {
        team_expense_id: s.team_expense_id,
        label: e
          ? `Expense — ${e.expense_code ?? e.description}`
          : "Team expense share",
      });
    }
  }

  for (const c of charges) {
    if (c.source_type === "booking_share") {
      const meta = bookingMeta.get(c.source_id);
      if (meta) {
        c.booking_id = meta.booking_id;
        c.label = meta.label;
      }
    } else if (c.source_type === "team_expense_share") {
      const meta = expenseMeta.get(c.source_id);
      if (meta) {
        c.team_expense_id = meta.team_expense_id;
        c.label = meta.label;
      }
    }
  }
}

export { planBulkAllocation, totalOpenDue } from "@/lib/payment-allocation-plan";
export type { AllocationLine } from "@/lib/payment-allocation-plan";
