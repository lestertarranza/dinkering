import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, StatCard, Badge, PageHeader, EmptyState } from "@/components/ui";
import {
  formatMoney,
  formatDate,
  formatTimeRange,
  describeBalance,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import { round2 } from "@/lib/ledger";
import type { Booking, Payment, Player, PlayerGroup, TeamExpense } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: playerBalances },
    { data: groupBalances },
    { data: players },
    { data: groups },
    { data: bookings },
    { data: paidTotals },
    { data: bookingShares },
    { data: ledgerPayments },
    { data: recentPayments },
    { data: recentExpenses },
  ] = await Promise.all([
    supabase.from("player_balances").select("*"),
    supabase.from("group_balances").select("*"),
    supabase.from("players").select("id, name, active_status"),
    supabase.from("player_groups").select("id, name"),
    supabase.from("bookings").select("*"),
    supabase.from("booking_payment_totals").select("*"),
    supabase.from("booking_shares").select("booking_id, amount_owed"),
    supabase
      .from("ledger_entries")
      .select("credit_amount")
      .eq("source_type", "payment")
      .eq("voided", false),
    supabase
      .from("payments")
      .select("*, players(name), player_groups(name)")
      .order("payment_date", { ascending: false })
      .limit(6),
    supabase
      .from("team_expenses")
      .select("*, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)")
      .order("purchase_date", { ascending: false })
      .limit(6),
  ]);

  const playerName = new Map(
    ((players ?? []) as Player[]).map((p) => [p.id, p.name]),
  );
  const groupName = new Map(
    ((groups ?? []) as PlayerGroup[]).map((g) => [g.id, g.name]),
  );

  type Owner = {
    kind: "player" | "group";
    id: string;
    name: string;
    balance: number;
  };
  const owners: Owner[] = [
    ...((playerBalances ?? []).map((b) => ({
      kind: "player" as const,
      id: b.player_id as string,
      name: playerName.get(b.player_id as string) ?? "Player",
      balance: Number(b.balance),
    }))),
    ...((groupBalances ?? []).map((b) => ({
      kind: "group" as const,
      id: b.player_group_id as string,
      name: groupName.get(b.player_group_id as string) ?? "Group",
      balance: Number(b.balance),
    }))),
  ];

  const totalCollectible = owners
    .filter((o) => o.balance >= SETTLE_TOLERANCE)
    .reduce((s, o) => s + o.balance, 0);
  const totalCredits = owners
    .filter((o) => o.balance <= -SETTLE_TOLERANCE)
    .reduce((s, o) => s + Math.abs(o.balance), 0);
  const isBillable = (b: Booking) =>
    b.status === "booked" || b.status === "played";
  // Cost actually incurred (and billed to players) = played games only.
  const playedBookingCost = ((bookings ?? []) as Booking[])
    .filter((b) => b.status === "played")
    .reduce((s, b) => s + Number(b.total_booking_cost), 0);
  // Future court time committed but not yet played/billed.
  const upcomingCommitments = ((bookings ?? []) as Booking[])
    .filter((b) => b.status === "booked")
    .reduce((s, b) => s + Number(b.total_booking_cost), 0);
  const totalPayments = (ledgerPayments ?? []).reduce(
    (s, p) => s + Number(p.credit_amount),
    0,
  );

  const paidMap = new Map(
    (paidTotals ?? []).map((b) => [b.booking_id as string, Number(b.total_paid)]),
  );
  const shareMap = new Map<string, number>();
  for (const s of (bookingShares ?? []) as {
    booking_id: string;
    amount_owed: number;
  }[]) {
    shareMap.set(
      s.booking_id,
      (shareMap.get(s.booking_id) ?? 0) + Number(s.amount_owed),
    );
  }
  // Collectible per booking = charged shares − payments (ledger basis), so the
  // dashboard agrees with the booking pages and player balances.
  const bookingDue = (b: Booking) =>
    round2((shareMap.get(b.id) ?? 0) - (paidMap.get(b.id) ?? 0));
  const allBookings = (bookings ?? []) as Booking[];
  const upcoming = allBookings
    .filter((b) => b.play_date >= today && b.status === "booked")
    .sort((a, b) => a.play_date.localeCompare(b.play_date))
    .slice(0, 6);
  const unpaid = allBookings
    .filter(
      (b) =>
        isBillable(b) &&
        (shareMap.get(b.id) ?? 0) >= SETTLE_TOLERANCE &&
        bookingDue(b) >= SETTLE_TOLERANCE,
    )
    .sort((a, b) => b.play_date.localeCompare(a.play_date))
    .slice(0, 6);

  const withBalance = owners
    .filter((o) => o.balance >= SETTLE_TOLERANCE)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8);
  const withCredit = owners
    .filter((o) => o.balance <= -SETTLE_TOLERANCE)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Money owed, credits, bookings, and recent activity."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Outstanding collectible"
          value={formatMoney(totalCollectible)}
          tone="collect"
          hint="Sum of all positive balances"
        />
        <StatCard
          label="Player / group credits"
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
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Upcoming bookings
            </h2>
            <Link
              href="/admin/bookings"
              className="text-xs text-emerald-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="p-3">
            {upcoming.length === 0 ? (
              <EmptyState title="No upcoming bookings" />
            ) : (
              <ul className="space-y-1">
                {upcoming.map((b) => {
                  const ctx = [
                    formatTimeRange(b.start_time, b.end_time),
                    b.venue,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-slate-700">
                            {b.booking_code}
                          </span>{" "}
                          <span className="text-slate-400">
                            {formatDate(b.play_date)}
                          </span>
                          {ctx ? (
                            <span className="mt-0.5 block text-xs text-slate-400">
                              {ctx}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-slate-600">
                          {formatMoney(b.total_booking_cost)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Unpaid / partial bookings
            </h2>
          </div>
          <div className="p-3">
            {unpaid.length === 0 ? (
              <EmptyState title="Everything is paid up 🎉" />
            ) : (
              <ul className="space-y-1">
                {unpaid.map((b) => {
                  const due = bookingDue(b);
                  const ctx = [
                    formatTimeRange(b.start_time, b.end_time),
                    b.venue,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-slate-700">
                            {b.booking_code}
                          </span>{" "}
                          <span className="text-slate-400">
                            {formatDate(b.play_date)}
                          </span>
                          {ctx ? (
                            <span className="mt-0.5 block text-xs text-slate-400">
                              {ctx}
                            </span>
                          ) : null}
                        </span>
                        <Badge tone="collect">{formatMoney(due)} due</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Players / groups who owe
          </h2>
          <div className="p-3">
            {withBalance.length === 0 ? (
              <EmptyState title="Nobody owes anything" />
            ) : (
              <ul className="space-y-1">
                {withBalance.map((o) => (
                  <li key={`${o.kind}-${o.id}`}>
                    <Link
                      href={`/admin/${o.kind === "player" ? "players" : "groups"}/${o.id}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="text-slate-700">{o.name}</span>
                      <span className="font-medium text-rose-600">
                        {formatMoney(o.balance)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Players / groups with credit
          </h2>
          <div className="p-3">
            {withCredit.length === 0 ? (
              <EmptyState title="No credits on file" />
            ) : (
              <ul className="space-y-1">
                {withCredit.map((o) => {
                  const d = describeBalance(o.balance);
                  return (
                    <li key={`${o.kind}-${o.id}`}>
                      <Link
                        href={`/admin/${o.kind === "player" ? "players" : "groups"}/${o.id}`}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <span className="text-slate-700">{o.name}</span>
                        <span className="font-medium text-emerald-600">
                          {formatMoney(d.amount)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Recent payments
            </h2>
            <Link
              href="/admin/payments"
              className="text-xs text-emerald-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="p-3">
            {(recentPayments ?? []).length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="space-y-1">
                {(
                  recentPayments as (Payment & {
                    players: { name: string } | null;
                    player_groups: { name: string } | null;
                  })[]
                ).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">
                      {p.players?.name ?? p.player_groups?.name ?? "—"}
                      <span className="ml-2 text-xs text-slate-400">
                        {formatDate(p.payment_date)}
                      </span>
                    </span>
                    <span className="font-medium text-emerald-600">
                      {formatMoney(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">
              Recent team expenses
            </h2>
            <Link
              href="/admin/expenses"
              className="text-xs text-emerald-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="p-3">
            {(recentExpenses ?? []).length === 0 ? (
              <EmptyState title="No team expenses yet" />
            ) : (
              <ul className="space-y-1">
                {(
                  recentExpenses as (TeamExpense & {
                    players: { name: string } | null;
                    player_groups: { name: string } | null;
                  })[]
                ).map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">
                      {e.description}
                      <span className="ml-2 text-xs text-slate-400">
                        {formatDate(e.purchase_date)}
                      </span>
                    </span>
                    <span className="font-medium text-slate-600">
                      {formatMoney(e.total_cost)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
