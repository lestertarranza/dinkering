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
import { round2 } from "@/lib/ledger";
import {
  batchComputePlayerOpenCharges,
  type LedgerRow,
} from "@/lib/payment-allocation";
import type { Booking, Payment, Player, PlayerGroup, TeamExpense } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{
    up?: string;
    un?: string;
    owe?: string;
    cred?: string;
    pay?: string;
    exp?: string;
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
    { data: players },
    { data: groups },
    { data: bookings },
    { data: paidTotals },
    { data: bookingShares },
    { data: dashTotals },
    { data: recentPayments },
    { data: recentExpenses },
  ] = await Promise.all([
    supabase.from("player_balances").select("*"),
    supabase.from("players").select("id, name, active_status"),
    supabase.from("player_groups").select("id, name"),
    supabase
      .from("bookings")
      .select("id, booking_code, play_date, start_time, end_time, venue, status, total_booking_cost"),
    supabase.from("booking_payment_totals").select("*"),
    supabase.from("booking_shares").select("booking_id, amount_owed"),
    supabase.from("dashboard_totals").select("*").single(),
    supabase
      .from("payments")
      .select("*, players(name), player_groups(name)")
      .order("payment_date", { ascending: false })
      .limit(PAGE_SIZE * 3),
    supabase
      .from("team_expenses")
      .select("*, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)")
      .order("purchase_date", { ascending: false })
      .limit(PAGE_SIZE * 3),
  ]);

  const playerNameMap = new Map(
    ((players ?? []) as Player[]).map((p) => [p.id, p.name]),
  );
  const groupNameMap = new Map(
    ((groups ?? []) as PlayerGroup[]).map((g) => [g.id, g.name]),
  );

  // ── Stat card totals ────────────────────────────────────────────────────────
  const playerOwners = ((playerBalances ?? []) as { player_id: string; balance: number }[]).map(
    (b) => ({
      kind: "player" as const,
      id: b.player_id,
      name: playerNameMap.get(b.player_id) ?? "Player",
      balance: Number(b.balance),
    }),
  );

  const totalCollectible = round2(
    playerOwners.filter((o) => o.balance >= SETTLE_TOLERANCE).reduce((s, o) => s + o.balance, 0),
  );
  const totalCredits = round2(
    playerOwners.filter((o) => o.balance <= -SETTLE_TOLERANCE).reduce((s, o) => s + Math.abs(o.balance), 0),
  );

  const playedBookingCost = Number(dashTotals?.played_booking_cost ?? 0);
  const upcomingCommitments = Number(dashTotals?.upcoming_commitments ?? 0);
  const totalPayments = Number(dashTotals?.total_payments ?? 0);

  // ── Bookings ────────────────────────────────────────────────────────────────
  const paidMap = new Map(
    (paidTotals ?? []).map((b) => [b.booking_id as string, Number(b.total_paid)]),
  );
  const shareMap = new Map<string, number>();
  for (const s of (bookingShares ?? []) as { booking_id: string; amount_owed: number }[]) {
    shareMap.set(s.booking_id, (shareMap.get(s.booking_id) ?? 0) + Number(s.amount_owed));
  }
  const bookingDue = (b: Booking) =>
    round2((shareMap.get(b.id) ?? 0) - (paidMap.get(b.id) ?? 0));

  const allBookings = (bookings ?? []) as Booking[];
  const upcomingAll = allBookings
    .filter((b) => b.play_date >= today && b.status === "booked")
    .sort((a, b) => a.play_date.localeCompare(b.play_date));
  const unpaidAll = allBookings
    .filter(
      (b) =>
        (b.status === "booked" || b.status === "played") &&
        (shareMap.get(b.id) ?? 0) >= SETTLE_TOLERANCE &&
        bookingDue(b) >= SETTLE_TOLERANCE,
    )
    .sort((a, b) => b.play_date.localeCompare(a.play_date));

  // ── Players who owe (personal wallet only) ──────────────────────────────────
  const playersWhoOweAll = playerOwners
    .filter((o) => o.balance >= SETTLE_TOLERANCE)
    .sort((a, b) => b.balance - a.balance);
  const playersWithCreditAll = playerOwners
    .filter((o) => o.balance <= -SETTLE_TOLERANCE)
    .sort((a, b) => a.balance - b.balance);

  // Paginate
  const upFrom   = (upPage   - 1) * PAGE_SIZE;
  const unFrom   = (unPage   - 1) * PAGE_SIZE;
  const oweFrom  = (owePage  - 1) * PAGE_SIZE;
  const credFrom = (credPage - 1) * PAGE_SIZE;
  const payFrom  = (payPage  - 1) * PAGE_SIZE;
  const expFrom  = (expPage  - 1) * PAGE_SIZE;

  const upcomingPage  = upcomingAll.slice(upFrom, upFrom + PAGE_SIZE);
  const unpaidPage    = unpaidAll.slice(unFrom, unFrom + PAGE_SIZE);
  const owePage_data  = playersWhoOweAll.slice(oweFrom, oweFrom + PAGE_SIZE);
  const credPage_data = playersWithCreditAll.slice(credFrom, credFrom + PAGE_SIZE);

  // For each player on the current "who owes" page, batch-load their open charges.
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
    for (const [pid, charges] of computed) {
      openChargesByPlayer.set(pid, charges);
    }
  }

  // Enrich open charge labels (booking_code / expense_code + description)
  const allCharges = [...openChargesByPlayer.values()].flat();
  const bShareIds = allCharges.filter((c) => c.source_type === "booking_share").map((c) => c.source_id);
  const eShareIds = allCharges.filter((c) => c.source_type === "team_expense_share").map((c) => c.source_id);

  const manualAdjIds = allCharges
    .filter((c) => c.source_type === "manual_adjustment")
    .map((c) => c.source_id);

  const [{ data: bShareRows }, { data: eShareRows }, { data: maRows }] = await Promise.all([
    bShareIds.length
      ? supabase
          .from("booking_shares")
          .select("id, bookings(id, booking_code, play_date, venue, court_number)")
          .in("id", bShareIds)
      : Promise.resolve({ data: [] }),
    eShareIds.length
      ? supabase
          .from("team_expense_shares")
          .select(
            "id, team_expense_id, team_expenses(expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name))",
          )
          .in("id", eShareIds)
      : Promise.resolve({ data: [] }),
    manualAdjIds.length
      ? supabase
          .from("manual_adjustments")
          .select("id, type, reason")
          .in("id", manualAdjIds)
      : Promise.resolve({ data: [] }),
  ]);

  type BShareRow = {
    id: string;
    bookings: {
      id: string;
      booking_code: string | null;
      play_date: string;
      venue: string | null;
      court_number: string | null;
    } | null;
  };
  type EShareRow = {
    id: string;
    team_expense_id: string;
    team_expenses: {
      expense_code: string | null;
      description: string;
      players: { name: string } | null;
      player_groups: { name: string } | null;
    } | null;
  };
  const bShareLabel = new Map<string, { href: string; label: string }>();
  for (const s of (bShareRows ?? []) as unknown as BShareRow[]) {
    if (!s.bookings) continue;
    const b = s.bookings;
    const venuePart = [b.venue, b.court_number].filter(Boolean).join(" · ");
    bShareLabel.set(s.id, {
      href: `/admin/bookings/${b.id}`,
      label: [
        `Court ${b.booking_code ?? "booking"}`,
        formatDate(b.play_date),
        venuePart || null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  const eShareLabel = new Map<string, { href: string; label: string }>();
  for (const s of (eShareRows ?? []) as unknown as EShareRow[]) {
    const te = s.team_expenses;
    const paidBy =
      te?.players?.name ?? te?.player_groups?.name ?? null;
    eShareLabel.set(s.id, {
      href: `/admin/expenses/${s.team_expense_id}`,
      label: te
        ? [
            `${te.expense_code ?? "Expense"} · ${te.description}`,
            paidBy ? `Paid by ${paidBy}` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Expense",
    });
  }
  const maLabel = new Map<string, { label: string }>();
  for (const m of (maRows ?? []) as unknown as {
    id: string;
    type: string;
    reason: string;
  }[]) {
    maLabel.set(m.id, {
      label: `Manual ${m.type}: ${m.reason}`,
    });
  }

  const recentPaymentsPage = (recentPayments ?? []).slice(payFrom, payFrom + PAGE_SIZE);
  const recentExpensesPage = (recentExpenses ?? []).slice(expFrom, expFrom + PAGE_SIZE);

  // ── Helper: pagination bar ──────────────────────────────────────────────────
  function pagerHref(params: Record<string, string | number>) {
    const base: Record<string, string> = {};
    if (upPage   > 1) base.up   = String(upPage);
    if (unPage   > 1) base.un   = String(unPage);
    if (owePage  > 1) base.owe  = String(owePage);
    if (credPage > 1) base.cred = String(credPage);
    if (payPage  > 1) base.pay  = String(payPage);
    if (expPage  > 1) base.exp  = String(expPage);
    Object.assign(base, Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
    // Remove page=1 keys
    for (const key of Object.keys(base)) if (base[key] === "1") delete base[key];
    const qs = new URLSearchParams(base).toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  function Pager({
    current,
    total,
    paramKey,
  }: {
    current: number;
    total: number;
    paramKey: string;
  }) {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
        <span>
          {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, total === Infinity ? current * PAGE_SIZE : total)} of {total === Infinity ? "many" : total}
        </span>
        <div className="flex gap-2">
          {current > 1 ? (
            <Link href={pagerHref({ [paramKey]: current - 1 })} className="text-emerald-600 hover:underline">← Prev</Link>
          ) : null}
          {/* next is shown if the last page might have more */}
          <Link href={pagerHref({ [paramKey]: current + 1 })} className="text-emerald-600 hover:underline">Next →</Link>
        </div>
      </div>
    );
  }

  // Simple total-aware pager for finite lists
  function FinitePager({
    current,
    totalItems,
    paramKey,
  }: {
    current: number;
    totalItems: number;
    paramKey: string;
  }) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (totalPages <= 1) return null;
    const from = (current - 1) * PAGE_SIZE + 1;
    const to   = Math.min(current * PAGE_SIZE, totalItems);
    return (
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
        <span>{from}–{to} of {totalItems}</span>
        <div className="flex gap-2">
          {current > 1 ? (
            <Link href={pagerHref({ [paramKey]: current - 1 })} className="text-emerald-600 hover:underline">← Prev</Link>
          ) : null}
          {current < totalPages ? (
            <Link href={pagerHref({ [paramKey]: current + 1 })} className="text-emerald-600 hover:underline">Next →</Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Money owed, credits, bookings, and recent activity."
        action={
          <Link href="/admin/collections" className={buttonClass("secondary")}>
            Collections →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Outstanding collectible"
          value={formatMoney(totalCollectible)}
          tone="collect"
          hint="Sum of all positive player balances"
        />
        <StatCard
          label="Player credits"
          value={formatMoney(totalCredits)}
          tone="credit"
          hint="Advance & overpayments"
        />
        <StatCard
          label="Payments received"
          value={formatMoney(totalPayments)}
          tone="info"
        />
        <StatCard
          label="Court cost (played)"
          value={formatMoney(playedBookingCost)}
          tone="neutral"
          hint="Cost of games played & billed"
        />
        <StatCard
          label="Upcoming commitments"
          value={formatMoney(upcomingCommitments)}
          tone="neutral"
          hint="Future booked games not yet billed"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Upcoming bookings */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Upcoming bookings</h2>
            <Link href="/admin/bookings" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {upcomingPage.length === 0 ? (
              <EmptyState title="No upcoming bookings" />
            ) : (
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

        {/* Unpaid / partial bookings */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Unpaid / partial bookings</h2>
            <Link href="/admin/bookings" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {unpaidPage.length === 0 ? (
              <EmptyState title="Everything is paid up 🎉" />
            ) : (
              <ul className="space-y-1">
                {unpaidPage.map((b) => {
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
            )}
          </div>
          <FinitePager current={unPage} totalItems={unpaidAll.length} paramKey="un" />
        </Card>

        {/* Players who owe */}
        <Card>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Players who owe
          </h2>
          <div className="p-3">
            {owePage_data.length === 0 ? (
              <EmptyState title="Nobody owes anything" />
            ) : (
              <ul className="space-y-2">
                {owePage_data.map((o) => {
                  const charges = openChargesByPlayer.get(o.id) ?? [];
                  return (
                    <li key={o.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                      <Link href={`/admin/players/${o.id}`} className="flex items-center justify-between text-sm hover:underline">
                        <span className="font-medium text-slate-700">{o.name}</span>
                        <span className="font-semibold text-rose-600">{formatMoney(o.balance)}</span>
                      </Link>
                      {charges.length > 0 ? (
                        <ul className="mt-1.5 space-y-0.5 border-t border-slate-200 pt-1.5">
                          {charges.map((c) => {
                            const linked =
                              c.source_type === "booking_share"
                                ? bShareLabel.get(c.source_id)
                                : c.source_type === "team_expense_share"
                                  ? eShareLabel.get(c.source_id)
                                  : null;
                            const adj =
                              c.source_type === "manual_adjustment"
                                ? maLabel.get(c.source_id)
                                : null;
                            const fallbackLabel =
                              adj?.label ?? c.label ?? c.source_type;
                            return (
                              <li key={c.source_id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                {linked ? (
                                  <Link href={linked.href} className="truncate text-emerald-700 hover:underline">
                                    {linked.label}
                                  </Link>
                                ) : (
                                  <span className="truncate text-slate-500">
                                    {fallbackLabel}
                                  </span>
                                )}
                                <span className="shrink-0 font-medium text-rose-600">{formatMoney(c.remaining)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <FinitePager current={owePage} totalItems={playersWhoOweAll.length} paramKey="owe" />
        </Card>

        {/* Players with credit */}
        <Card>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Players / groups with credit
          </h2>
          <div className="p-3">
            {credPage_data.length === 0 ? (
              <EmptyState title="No credits on file" />
            ) : (
              <ul className="space-y-1">
                {credPage_data.map((o) => {
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
              </ul>
            )}
          </div>
          <FinitePager current={credPage} totalItems={playersWithCreditAll.length} paramKey="cred" />
        </Card>

        {/* Recent payments */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent payments</h2>
            <Link href="/admin/payments" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {recentPaymentsPage.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="space-y-1">
                {(recentPaymentsPage as (Payment & { players: { name: string } | null; player_groups: { name: string } | null })[]).map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-700">
                      {p.players?.name ?? p.player_groups?.name ?? "—"}
                      <span className="ml-2 text-xs text-slate-400">{formatDate(p.payment_date)}</span>
                    </span>
                    <span className="font-medium text-emerald-600">{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FinitePager current={payPage} totalItems={(recentPayments ?? []).length} paramKey="pay" />
        </Card>

        {/* Recent team expenses */}
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent team expenses</h2>
            <Link href="/admin/expenses" className="text-xs text-emerald-600 hover:underline">View all</Link>
          </div>
          <div className="p-3">
            {recentExpensesPage.length === 0 ? (
              <EmptyState title="No team expenses yet" />
            ) : (
              <ul className="space-y-1">
                {(recentExpensesPage as (TeamExpense & { players: { name: string } | null; player_groups: { name: string } | null })[]).map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/expenses/${e.id}`} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
                      <span className="text-slate-700">
                        {e.description}
                        <span className="ml-2 text-xs text-slate-400">{formatDate(e.purchase_date)}</span>
                      </span>
                      <span className="font-medium text-slate-600">{formatMoney(e.total_cost)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FinitePager current={expPage} totalItems={(recentExpenses ?? []).length} paramKey="exp" />
        </Card>
      </div>
    </div>
  );
}
