import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, StatCard, Badge, PageHeader, EmptyState, buttonClass } from "@/components/ui";
import {
  formatMoney,
  formatDate,
  formatTimeRange,
  describeBalance,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import { round2, resolveWalletOwnersForPlayers } from "@/lib/ledger";
import {
  batchComputePlayerOpenCharges,
  computeBookingShareRemaining,
  type LedgerRow,
} from "@/lib/payment-allocation";
import type { Payment, Player, PlayerGroup, TeamExpense } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

const SPLIT_LABELS: Record<string, string> = {
  active_players: "All active players",
  selected_players: "Selected players",
  attendees: "Booking attendees",
  custom: "Custom",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{
    up?: string; un?: string; owe?: string; cred?: string; pay?: string; exp?: string;
  }>;
}) {
  const sp = await searchParams;
  const upPage   = Math.max(1, parseInt(sp.up   ?? "1", 10) || 1);
  const unPage   = Math.max(1, parseInt(sp.un   ?? "1", 10) || 1);
  const owePage  = Math.max(1, parseInt(sp.owe  ?? "1", 10) || 1);
  const credPage = Math.max(1, parseInt(sp.cred ?? "1", 10) || 1);
  const payPage  = Math.max(1, parseInt(sp.pay  ?? "1", 10) || 1);
  const expPage  = Math.max(1, parseInt(sp.exp  ?? "1", 10) || 1);

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: playerBalances },
    { data: groupBalances },
    { data: players },
    { data: groups },
    { data: groupMemberships },
    { data: bookings },
    { data: bookingShares },
    { data: expenseShares },
    { data: dashTotals },
    { data: recentPayments },
    { data: allExpenses },
  ] = await Promise.all([
    supabase.from("player_balances").select("player_id, balance"),
    supabase.from("group_balances").select("player_group_id, balance"),
    supabase.from("players").select("id, name"),
    supabase.from("player_groups").select("id, name"),
    supabase
      .from("player_group_members")
      .select("player_id, player_group_id, players!inner(name)")
      .is("end_date", null),
    supabase
      .from("bookings")
      .select("id, booking_code, play_date, start_time, end_time, venue, status, total_booking_cost"),
    supabase
      .from("booking_shares")
      .select("id, booking_id, player_id, amount_owed"),
    supabase.from("team_expense_shares").select("id, team_expense_id, player_id, player_group_id, amount_owed"),
    supabase.from("dashboard_totals").select("*").single(),
    supabase
      .from("payments")
      .select(
        "id, payment_code, payment_date, amount, payment_method, reference_number, notes, payer_player_id, payer_group_id, booking_id, team_expense_id, players(name), player_groups(name), bookings(booking_code, play_date), team_expenses(expense_code, description)",
      )
      .order("payment_date", { ascending: false })
      .limit(PAGE_SIZE * 3),
    supabase
      .from("team_expenses")
      .select(
        "id, expense_code, description, purchase_date, total_cost, status, split_method, notes, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)",
      )
      .order("purchase_date", { ascending: false })
      .limit(PAGE_SIZE * 3),
  ]);

  const playerNameMap = new Map(
    ((players ?? []) as Player[]).map((p) => [p.id, p.name]),
  );
  const groupNameMap = new Map(
    ((groups ?? []) as PlayerGroup[]).map((g) => [g.id, g.name]),
  );

  // ── Group members for credit box ─────────────────────────────────────────
  const groupMembersMap = new Map<string, string[]>();
  for (const m of (groupMemberships ?? []) as unknown as {
    player_id: string;
    player_group_id: string;
    players: { name: string } | null;
  }[]) {
    if (!m.players) continue;
    const list = groupMembersMap.get(m.player_group_id) ?? [];
    list.push(m.players.name);
    groupMembersMap.set(m.player_group_id, list);
  }

  // ── Stat card totals ─────────────────────────────────────────────────────
  const playerOwners = ((playerBalances ?? []) as { player_id: string; balance: number }[]).map(
    (b) => ({ kind: "player" as const, id: b.player_id, name: playerNameMap.get(b.player_id) ?? "Player", balance: Number(b.balance) }),
  );
  const groupOwners = ((groupBalances ?? []) as { player_group_id: string; balance: number }[]).map(
    (b) => ({ kind: "group" as const, id: b.player_group_id, name: groupNameMap.get(b.player_group_id) ?? "Group", balance: Number(b.balance) }),
  );

  const allOwners = [...playerOwners, ...groupOwners];
  const totalCollectible = round2(allOwners.filter((o) => o.balance >= SETTLE_TOLERANCE).reduce((s, o) => s + o.balance, 0));
  const totalCredits     = round2(allOwners.filter((o) => o.balance <= -SETTLE_TOLERANCE).reduce((s, o) => s + Math.abs(o.balance), 0));

  const playedBookingCost  = Number(dashTotals?.played_booking_cost  ?? 0);
  const upcomingCommitments = Number(dashTotals?.upcoming_commitments ?? 0);
  const totalPayments      = Number(dashTotals?.total_payments        ?? 0);

  // ── Bookings ─────────────────────────────────────────────────────────────
  type BookingShareRow = { id: string; booking_id: string; player_id: string | null; amount_owed: number };
  const allBookingShareRows = (bookingShares ?? []) as BookingShareRow[];
  const shareMap = new Map<string, number>();
  for (const s of allBookingShareRows) {
    shareMap.set(s.booking_id, (shareMap.get(s.booking_id) ?? 0) + Number(s.amount_owed));
  }

  type BookingRow = { id: string; booking_code: string | null; play_date: string; start_time: string | null; end_time: string | null; venue: string | null; status: string; total_booking_cost: number };
  const allBookings = (bookings ?? []) as BookingRow[];

  // Outstanding per booking — FIFO wallet-based (matches booking detail page).
  // A share is settled by an explicit payment OR by credit auto-applied from
  // the player's wallet, so the payments-only booking_payment_totals view would
  // understate what's been paid. We reuse the same FIFO open-charge engine.
  const bookingDateMap = new Map(allBookings.map((b) => [b.id, b.play_date]));
  const bookingShareRemaining = await computeBookingShareRemaining(
    supabase,
    allBookingShareRows,
    bookingDateMap,
    today,
  );
  const bookingOutstandingMap = new Map<string, number>(); // booking_id → outstanding
  for (const s of allBookingShareRows) {
    const remaining = bookingShareRemaining.get(s.id) ?? 0;
    bookingOutstandingMap.set(
      s.booking_id,
      round2((bookingOutstandingMap.get(s.booking_id) ?? 0) + remaining),
    );
  }

  const bookingDue = (b: BookingRow) => round2(bookingOutstandingMap.get(b.id) ?? 0);
  const upcomingAll = allBookings.filter((b) => b.play_date >= today && b.status === "booked").sort((a, b) => a.play_date.localeCompare(b.play_date));
  const unpaidBookingsAll = allBookings.filter((b) => (b.status === "booked" || b.status === "played") && (shareMap.get(b.id) ?? 0) >= SETTLE_TOLERANCE && bookingDue(b) >= SETTLE_TOLERANCE).sort((a, b) => b.play_date.localeCompare(a.play_date));

  // ── Team expense outstanding — FIFO wallet-based (matches expense detail) ─
  // Uses the same per-wallet ledger balance approach as the "Who has paid"
  // section on the expense detail page so the numbers are consistent.
  type ExpenseShareRow = { id: string; team_expense_id: string; player_id: string | null; player_group_id: string | null; amount_owed: number };
  const allExpShareRows = (expenseShares ?? []) as ExpenseShareRow[];

  const expOutstandingMap = new Map<string, number>(); // expense_id → outstanding

  if (allExpShareRows.length > 0) {
    // 1. Resolve wallets for player-assigned shares, using the expense's own
    //    purchase_date (not today). This matches the expense detail page which
    //    also resolves wallets as of the purchase date. Group by unique date
    //    so we don't make more DB calls than necessary.
    const expDateMap = new Map(
      ((allExpenses ?? []) as { id: string; purchase_date: string }[]).map(
        (e) => [e.id, e.purchase_date],
      ),
    );
    const playersByDate = new Map<string, Set<string>>();
    for (const s of allExpShareRows.filter((s) => s.player_id)) {
      const date = expDateMap.get(s.team_expense_id) ?? today;
      const set = playersByDate.get(date) ?? new Set<string>();
      set.add(s.player_id!);
      playersByDate.set(date, set);
    }
    // Call resolveWalletOwnersForPlayers once per unique purchase_date.
    const walletOwnersByPlayerDate = new Map<string, { player_id: string | null; player_group_id: string | null }>();
    await Promise.all(
      [...playersByDate.entries()].map(async ([date, pids]) => {
        const owners = await resolveWalletOwnersForPlayers(supabase, [...pids], date);
        for (const [pid, owner] of owners) {
          walletOwnersByPlayerDate.set(`${pid}:${date}`, owner);
        }
      }),
    );
    // Build a unified view of walletOwner per player, keyed by `pid:date`.
    const walletOwners = walletOwnersByPlayerDate;

    // 2. Collect all distinct wallets.
    const walletPIds = new Set<string>();
    const walletGIds = new Set<string>();
    for (const owner of walletOwners.values()) {
      if (owner.player_id) walletPIds.add(owner.player_id);
      if (owner.player_group_id) walletGIds.add(owner.player_group_id);
    }
    // Shares assigned directly to a group → that group's wallet.
    for (const s of allExpShareRows) {
      if (s.player_group_id) walletGIds.add(s.player_group_id);
    }
    // Helper: look up the resolved wallet for a player share using the date key.
    const getShareWallet = (s: ExpenseShareRow) => {
      if (s.player_id) {
        const date = expDateMap.get(s.team_expense_id) ?? today;
        return walletOwners.get(`${s.player_id}:${date}`)
          ?? { player_id: s.player_id, player_group_id: null };
      }
      return { player_id: null, player_group_id: s.player_group_id };
    };

    // 3. Batch-fetch ledger entries for all wallets.
    const [{ data: pLedger }, { data: gLedger }] = await Promise.all([
      walletPIds.size
        ? supabase
            .from("ledger_entries")
            .select("entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount, player_id")
            .in("player_id", [...walletPIds])
            .eq("voided", false)
            .order("entry_date")
            .order("created_at")
        : Promise.resolve({ data: [] }),
      walletGIds.size
        ? supabase
            .from("ledger_entries")
            .select("entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount, player_group_id")
            .in("player_group_id", [...walletGIds])
            .eq("voided", false)
            .order("entry_date")
            .order("created_at")
        : Promise.resolve({ data: [] }),
    ]);

    // 4. Group by wallet key and run FIFO per wallet.
    const walletEntries = new Map<string, LedgerRow[]>();
    for (const row of (pLedger ?? []) as (LedgerRow & { player_id: string })[]) {
      const key = `p:${row.player_id}`;
      const list = walletEntries.get(key) ?? [];
      list.push(row);
      walletEntries.set(key, list);
    }
    for (const row of (gLedger ?? []) as (LedgerRow & { player_group_id: string })[]) {
      const key = `g:${row.player_group_id}`;
      const list = walletEntries.get(key) ?? [];
      list.push(row);
      walletEntries.set(key, list);
    }

    const chargesByWallet = batchComputePlayerOpenCharges(walletEntries);

    // 5. Build share_id → remaining map from FIFO results.
    const shareRemainingMap = new Map<string, number>();
    for (const charges of chargesByWallet.values()) {
      for (const c of charges) {
        if (c.source_type === "team_expense_share") {
          shareRemainingMap.set(c.source_id, c.remaining);
        }
      }
    }

    // 6. Sum per expense — look up remaining using the correct wallet key.
    for (const s of allExpShareRows) {
      const w = getShareWallet(s);
      const walletKey = w.player_group_id
        ? `g:${w.player_group_id}`
        : w.player_id
          ? `p:${w.player_id}`
          : null;
      // Try the FIFO result; fall back to 0 if not present (fully settled).
      const remaining =
        walletKey && shareRemainingMap.has(s.id)
          ? (shareRemainingMap.get(s.id) ?? 0)
          : 0;
      expOutstandingMap.set(
        s.team_expense_id,
        round2((expOutstandingMap.get(s.team_expense_id) ?? 0) + remaining),
      );
    }
  }

  const expDue = (id: string) => expOutstandingMap.get(id) ?? 0;

  type ExpenseRow = { id: string; expense_code: string | null; description: string; purchase_date: string; total_cost: number; status: string; split_method: string; notes: string | null; players: { name: string } | null; player_groups: { name: string } | null };
  const expenses = (allExpenses ?? []) as unknown as ExpenseRow[];

  const unpaidExpensesAll = expenses
    .filter((e) => e.status === "open" && expDue(e.id) >= SETTLE_TOLERANCE)
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));

  // ── Who owes / who has credit ─────────────────────────────────────────────
  const playersWhoOweAll  = playerOwners.filter((o) => o.balance >= SETTLE_TOLERANCE).sort((a, b) => b.balance - a.balance);
  const groupsWhoOweAll   = groupOwners.filter((o) => o.balance >= SETTLE_TOLERANCE).sort((a, b) => b.balance - a.balance);
  const playersWithCreditAll = playerOwners.filter((o) => o.balance <= -SETTLE_TOLERANCE).sort((a, b) => a.balance - b.balance);
  const groupsWithCreditAll  = groupOwners.filter((o) => o.balance <= -SETTLE_TOLERANCE).sort((a, b) => a.balance - b.balance);

  // ── Pagination slices ─────────────────────────────────────────────────────
  const upFrom   = (upPage   - 1) * PAGE_SIZE;
  const unFrom   = (unPage   - 1) * PAGE_SIZE;
  const oweFrom  = (owePage  - 1) * PAGE_SIZE;
  const credFrom = (credPage - 1) * PAGE_SIZE;
  const payFrom  = (payPage  - 1) * PAGE_SIZE;
  const expFrom  = (expPage  - 1) * PAGE_SIZE;

  const upcomingPage       = upcomingAll.slice(upFrom, upFrom + PAGE_SIZE);
  const unpaidBookingsPage = unpaidBookingsAll.slice(unFrom, unFrom + PAGE_SIZE);
  const owePage_data       = playersWhoOweAll.slice(oweFrom, oweFrom + PAGE_SIZE);
  const oweGroupsPage      = groupsWhoOweAll.slice(oweFrom, oweFrom + PAGE_SIZE);
  const credPlayersPage    = playersWithCreditAll.slice(credFrom, credFrom + PAGE_SIZE);
  const credGroupsPage     = groupsWithCreditAll.slice(credFrom, credFrom + PAGE_SIZE);
  const recentPaymentsPage = (recentPayments ?? []).slice(payFrom, payFrom + PAGE_SIZE);
  const recentExpensesPage = expenses.slice(expFrom, expFrom + PAGE_SIZE);

  const credTotal = playersWithCreditAll.length + groupsWithCreditAll.length;
  const oweTotal  = playersWhoOweAll.length + groupsWhoOweAll.length;

  // ── Open-charge enrichment for "who owes" box ──────────────────────────────
  let openChargesByPlayer = new Map<string, { source_type: string; source_id: string; label: string; remaining: number }[]>();
  if (owePage_data.length > 0) {
    const owePlayerIds = owePage_data.map((o) => o.id);
    const { data: rawLedger } = await supabase
      .from("ledger_entries")
      .select("entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount, player_id")
      .in("player_id", owePlayerIds)
      .eq("voided", false)
      .order("entry_date")
      .order("created_at");

    const byPlayer = new Map<string, LedgerRow[]>();
    for (const row of (rawLedger ?? []) as (LedgerRow & { player_id: string })[]) {
      const list = byPlayer.get(row.player_id) ?? [];
      list.push(row);
      byPlayer.set(row.player_id, list);
    }
    const computed = batchComputePlayerOpenCharges(byPlayer);
    for (const [pid, charges] of computed) openChargesByPlayer.set(pid, charges);
  }

  const allCharges = [...openChargesByPlayer.values()].flat();
  const bShareIds    = allCharges.filter((c) => c.source_type === "booking_share").map((c) => c.source_id);
  const eShareIds    = allCharges.filter((c) => c.source_type === "team_expense_share").map((c) => c.source_id);
  const manualAdjIds = allCharges.filter((c) => c.source_type === "manual_adjustment").map((c) => c.source_id);

  const [{ data: bShareRows }, { data: eShareRows }, { data: maRows }] = await Promise.all([
    bShareIds.length ? supabase.from("booking_shares").select("id, bookings(id, booking_code, play_date, venue, court_number)").in("id", bShareIds) : Promise.resolve({ data: [] }),
    eShareIds.length ? supabase.from("team_expense_shares").select("id, team_expense_id, team_expenses(expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name))").in("id", eShareIds) : Promise.resolve({ data: [] }),
    manualAdjIds.length ? supabase.from("manual_adjustments").select("id, type, reason").in("id", manualAdjIds) : Promise.resolve({ data: [] }),
  ]);

  type BShareRow = { id: string; bookings: { id: string; booking_code: string | null; play_date: string; venue: string | null; court_number: string | null } | null };
  type EShareRow = { id: string; team_expense_id: string; team_expenses: { expense_code: string | null; description: string; players: { name: string } | null; player_groups: { name: string } | null } | null };

  const bShareLabel = new Map<string, { href: string; label: string }>();
  for (const s of (bShareRows ?? []) as unknown as BShareRow[]) {
    if (!s.bookings) continue;
    const b = s.bookings;
    const venuePart = [b.venue, b.court_number].filter(Boolean).join(" · ");
    bShareLabel.set(s.id, { href: `/admin/bookings/${b.id}`, label: [`Court ${b.booking_code ?? "booking"}`, formatDate(b.play_date), venuePart || null].filter(Boolean).join(" · ") });
  }
  const eShareLabel = new Map<string, { href: string; label: string }>();
  for (const s of (eShareRows ?? []) as unknown as EShareRow[]) {
    const te = s.team_expenses;
    const paidBy = te?.players?.name ?? te?.player_groups?.name ?? null;
    eShareLabel.set(s.id, { href: `/admin/expenses/${s.team_expense_id}`, label: te ? [`${te.expense_code ?? "Expense"} · ${te.description}`, paidBy ? `Paid by ${paidBy}` : null].filter(Boolean).join(" · ") : "Expense" });
  }
  const maLabel = new Map<string, string>();
  for (const m of (maRows ?? []) as unknown as { id: string; type: string; reason: string }[]) {
    maLabel.set(m.id, `Manual ${m.type}: ${m.reason}`);
  }

  // ── Pagination helper ─────────────────────────────────────────────────────
  function pagerHref(params: Record<string, string | number>) {
    const base: Record<string, string> = {};
    if (upPage   > 1) base.up   = String(upPage);
    if (unPage   > 1) base.un   = String(unPage);
    if (owePage  > 1) base.owe  = String(owePage);
    if (credPage > 1) base.cred = String(credPage);
    if (payPage  > 1) base.pay  = String(payPage);
    if (expPage  > 1) base.exp  = String(expPage);
    Object.assign(base, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
    for (const key of Object.keys(base)) if (base[key] === "1") delete base[key];
    const qs = new URLSearchParams(base).toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  function FinitePager({ current, totalItems, paramKey }: { current: number; totalItems: number; paramKey: string }) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (totalPages <= 1) return null;
    const from = (current - 1) * PAGE_SIZE + 1;
    const to   = Math.min(current * PAGE_SIZE, totalItems);
    return (
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
        <span>{from}–{to} of {totalItems}</span>
        <div className="flex gap-2">
          {current > 1 ? <Link href={pagerHref({ [paramKey]: current - 1 })} className="text-emerald-600 hover:underline">← Prev</Link> : null}
          {current < totalPages ? <Link href={pagerHref({ [paramKey]: current + 1 })} className="text-emerald-600 hover:underline">Next →</Link> : null}
        </div>
      </div>
    );
  }

  const summaryClass = "flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Money owed, credits, bookings, and recent activity."
        action={<Link href="/admin/collections" className={buttonClass("secondary")}>Collections →</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Outstanding collectible" value={formatMoney(totalCollectible)} tone="collect" hint="Sum of all positive balances" />
        <StatCard label="Credits on file"          value={formatMoney(totalCredits)}     tone="credit"  hint="Advance & overpayments" />
        <StatCard label="Payments received"        value={formatMoney(totalPayments)}    tone="info" />
        <StatCard label="Court cost (played)"      value={formatMoney(playedBookingCost)} tone="neutral" hint="Cost of games played & billed" />
        <StatCard label="Upcoming commitments"     value={formatMoney(upcomingCommitments)} tone="neutral" hint="Future booked games not yet billed" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">

        {/* ── Upcoming bookings ── */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming bookings</h2>
            <Link href="/admin/bookings" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {upcomingPage.length === 0 ? <EmptyState title="No upcoming bookings" /> : (
              <ul className="space-y-1">
                {upcomingPage.map((b) => {
                  const ctx = [formatTimeRange(b.start_time, b.end_time), b.venue].filter(Boolean).join(" · ");
                  return (
                    <li key={b.id}>
                      <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="font-medium text-slate-700">{b.booking_code}</span>{" "}
                          <span className="text-slate-400">{formatDate(b.play_date)}</span>
                          {ctx ? <span className="mt-0.5 block text-xs text-slate-400">{ctx}</span> : null}
                        </span>
                        <span className="shrink-0 text-slate-600">{formatMoney(b.total_booking_cost)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <FinitePager current={upPage} totalItems={upcomingAll.length} paramKey="up" />
        </Card>

        {/* ── Unpaid bookings & expense dues ── */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Unpaid bookings & expense dues</h2>
            <Link href="/admin/bookings" className="text-xs text-emerald-600 hover:underline">View bookings</Link>
          </div>
          <div className="p-3">
            {unpaidBookingsPage.length === 0 && unpaidExpensesAll.length === 0 ? (
              <EmptyState title="Everything is paid up 🎉" />
            ) : (
              <div className="space-y-3">
                {/* Unpaid court bookings */}
                {unpaidBookingsPage.length > 0 ? (
                  <div>
                    <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Court bookings</p>
                    <ul className="space-y-1">
                      {unpaidBookingsPage.map((b) => {
                        const due = bookingDue(b);
                        const ctx = [formatTimeRange(b.start_time, b.end_time), b.venue].filter(Boolean).join(" · ");
                        return (
                          <li key={b.id}>
                            <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                              <span className="min-w-0">
                                <span className="font-medium text-slate-700">{b.booking_code}</span>{" "}
                                <span className="text-slate-400">{formatDate(b.play_date)}</span>
                                {ctx ? <span className="mt-0.5 block text-xs text-slate-400">{ctx}</span> : null}
                              </span>
                              <Badge tone="collect">{formatMoney(due)} due</Badge>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    <FinitePager current={unPage} totalItems={unpaidBookingsAll.length} paramKey="un" />
                  </div>
                ) : null}

                {/* Unpaid team expenses */}
                {unpaidExpensesAll.length > 0 ? (
                  <div>
                    <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Team expenses</p>
                    <ul className="space-y-1">
                      {unpaidExpensesAll.slice(0, PAGE_SIZE).map((e) => {
                        const due = expDue(e.id);
                        const paidBy = e.players?.name ?? e.player_groups?.name;
                        return (
                          <li key={e.id}>
                            <Link href={`/admin/expenses/${e.id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                              <span className="min-w-0">
                                <span className="font-medium text-slate-700">{e.expense_code} · {e.description}</span>
                                <span className="mt-0.5 block text-xs text-slate-400">
                                  {formatDate(e.purchase_date)}
                                  {paidBy ? ` · Paid by ${paidBy}` : ""}
                                </span>
                              </span>
                              <Badge tone="warning">{formatMoney(due)} due</Badge>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </Card>

        {/* ── Balances — players + groups who owe (collapsible) ── */}
        <Card>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Balances</h2>
          <div className="p-3">
            {oweTotal === 0 ? <EmptyState title="Nobody owes anything" /> : (
              <ul className="space-y-1.5">
                {/* Players with open charges (collapsible drill-down) */}
                {owePage_data.map((o) => {
                  const charges = openChargesByPlayer.get(o.id) ?? [];
                  return (
                    <li key={o.id}>
                      <details className="rounded-lg border border-slate-200 bg-slate-50/60">
                        <summary className={summaryClass}>
                          <Link href={`/admin/players/${o.id}`} className="font-medium text-emerald-700 hover:underline">
                            {o.name}
                          </Link>
                          <span className="shrink-0 font-semibold text-rose-600">{formatMoney(o.balance)}</span>
                        </summary>
                        {charges.length > 0 ? (
                          <ul className="space-y-0.5 border-t border-slate-200 px-3 py-2">
                            {charges.map((c) => {
                              const linked = c.source_type === "booking_share" ? bShareLabel.get(c.source_id) : c.source_type === "team_expense_share" ? eShareLabel.get(c.source_id) : null;
                              const fallback = maLabel.get(c.source_id) ?? c.label ?? c.source_type;
                              return (
                                <li key={c.source_id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                  {linked ? (
                                    <Link href={linked.href} className="truncate text-emerald-700 hover:underline">{linked.label}</Link>
                                  ) : (
                                    <span className="truncate text-slate-500">{fallback}</span>
                                  )}
                                  <span className="shrink-0 font-medium text-rose-600">{formatMoney(c.remaining)}</span>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="px-3 py-2 text-xs text-slate-400">No open charge detail available.</p>
                        )}
                      </details>
                    </li>
                  );
                })}
                {/* Groups who owe (collapsible, shows members) */}
                {oweGroupsPage.map((o) => {
                  const members = groupMembersMap.get(o.id) ?? [];
                  return (
                    <li key={o.id}>
                      <details className="rounded-lg border border-slate-200 bg-rose-50/30">
                        <summary className={summaryClass}>
                          <span className="flex items-center gap-2">
                            <Badge tone="neutral">Group</Badge>
                            <Link href={`/admin/groups/${o.id}`} className="font-medium text-emerald-700 hover:underline">
                              {o.name}
                            </Link>
                          </span>
                          <span className="shrink-0 font-semibold text-rose-600">{formatMoney(o.balance)}</span>
                        </summary>
                        {members.length > 0 ? (
                          <ul className="flex flex-wrap gap-1 border-t border-slate-200 px-3 py-2">
                            {members.map((m) => (
                              <li key={m}>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{m}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <FinitePager current={owePage} totalItems={oweTotal} paramKey="owe" />
        </Card>

        {/* ── Players / groups with credit (collapsible groups) ── */}
        <Card>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Players / groups with credit
          </h2>
          <div className="p-3">
            {credTotal === 0 ? <EmptyState title="No credits on file" /> : (
              <ul className="space-y-1.5">
                {credPlayersPage.map((o) => {
                  const d = describeBalance(o.balance);
                  return (
                    <li key={o.id}>
                      <Link href={`/admin/players/${o.id}`} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                        <span className="text-slate-700">{o.name}</span>
                        <span className="font-medium text-emerald-600">{formatMoney(d.amount)}</span>
                      </Link>
                    </li>
                  );
                })}
                {credGroupsPage.map((o) => {
                  const d = describeBalance(o.balance);
                  const members = groupMembersMap.get(o.id) ?? [];
                  return (
                    <li key={o.id}>
                      <details className="rounded-lg border border-slate-200 bg-emerald-50/30">
                        <summary className={summaryClass}>
                          <span className="flex items-center gap-2">
                            <Badge tone="neutral">Group</Badge>
                            <Link href={`/admin/groups/${o.id}`} className="font-medium text-emerald-700 hover:underline">
                              {o.name}
                            </Link>
                          </span>
                          <span className="shrink-0 font-medium text-emerald-600">{formatMoney(d.amount)}</span>
                        </summary>
                        {members.length > 0 ? (
                          <ul className="flex flex-wrap gap-1 border-t border-slate-200 px-3 py-2">
                            {members.map((m) => (
                              <li key={m}>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{m}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <FinitePager current={credPage} totalItems={credTotal} paramKey="cred" />
        </Card>

        {/* ── Recent payments ── */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent payments</h2>
            <Link href="/admin/payments" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {recentPaymentsPage.length === 0 ? <EmptyState title="No payments yet" /> : (
              <ul className="space-y-1">
                {(recentPaymentsPage as unknown as (Payment & {
                  players: { name: string } | null;
                  player_groups: { name: string } | null;
                  bookings: { booking_code: string | null; play_date: string } | null;
                  team_expenses: { expense_code: string | null; description: string } | null;
                })[]).map((p) => {
                  const note = p.notes ?? "";
                  const reversed = note.startsWith("[REVERSED");
                  const isBulk = note.includes("Bulk settlement");
                  const payerName = p.players?.name ?? p.player_groups?.name ?? "—";
                  const appliedTo = p.bookings
                    ? `Court ${p.bookings.booking_code ?? "booking"} · ${formatDate(p.bookings.play_date)}`
                    : p.team_expenses
                      ? `${p.team_expenses.expense_code ?? "Expense"} · ${p.team_expenses.description}`
                      : isBulk
                        ? note.replace(/^\[REVERSED[^\]]*\]\s*/, "").replace(/^Bulk settlement · /, "").trim() || "Bulk settlement"
                        : "Advance / general";
                  const meta = [
                    p.payment_code,
                    formatDate(p.payment_date),
                    p.payment_method ?? null,
                    p.reference_number ? `ref ${p.reference_number}` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <li key={p.id} className={`px-3 py-2 text-sm ${reversed ? "opacity-50" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 truncate">
                            {payerName}
                            {isBulk ? <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">Auto</span> : null}
                            {reversed ? <span className="ml-1.5 line-through text-slate-400"> Reversed</span> : null}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400 truncate">{meta}</p>
                          <p className="mt-0.5 text-xs text-emerald-700 truncate">{appliedTo}</p>
                        </div>
                        <span className={`shrink-0 font-semibold ${reversed ? "text-slate-400 line-through" : "text-emerald-600"}`}>
                          {formatMoney(p.amount)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <FinitePager current={payPage} totalItems={(recentPayments ?? []).length} paramKey="pay" />
        </Card>

        {/* ── Recent team expenses ── */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent team expenses</h2>
            <Link href="/admin/expenses" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {recentExpensesPage.length === 0 ? <EmptyState title="No team expenses yet" /> : (
              <ul className="space-y-1">
                {recentExpensesPage.map((e) => {
                  const paidBy = e.players?.name ?? e.player_groups?.name ?? null;
                  const outstanding = expDue(e.id);
                  const isReversed = e.status === "reversed";
                  return (
                    <li key={e.id}>
                      <Link href={`/admin/expenses/${e.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {e.expense_code ? <span className="text-slate-400">{e.expense_code} · </span> : null}
                              {e.description}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400 truncate">
                              {formatDate(e.purchase_date)}
                              {paidBy ? ` · Paid by ${paidBy}` : ""}
                              {` · ${SPLIT_LABELS[e.split_method] ?? e.split_method}`}
                            </p>
                            {!isReversed && outstanding >= SETTLE_TOLERANCE ? (
                              <p className="mt-0.5 text-xs font-medium text-rose-600">{formatMoney(outstanding)} outstanding</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="font-semibold text-slate-700">{formatMoney(e.total_cost)}</span>
                            {isReversed ? (
                              <Badge tone="neutral">Reversed</Badge>
                            ) : outstanding < SETTLE_TOLERANCE ? (
                              <Badge tone="going">Settled</Badge>
                            ) : (
                              <Badge tone="warning">Open</Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <FinitePager current={expPage} totalItems={expenses.length} paramKey="exp" />
        </Card>

      </div>
    </div>
  );
}
