import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import {
  formatMoney,
  formatDate,
  describeBalance,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import {
  buildLedgerBookingContext,
  formatBookingContext,
} from "@/lib/booking-context";
import {
  PublicNavLink,
  PublicSection,
  publicMainClass,
  publicPrimaryText,
  publicMetaText,
  publicHintText,
} from "@/components/public-ui";
import type {
  Booking,
  BookingAttendance,
  LedgerEntry,
  Player,
} from "@/lib/types";
import { RsvpForm } from "./RsvpForm";
import { ScrollToHash } from "@/components/ScrollToHash";

const STATEMENT_LABELS: Record<string, string> = {
  booking_share: "Court",
  payment: "Payment",
  team_expense_share: "Team expense",
  team_expense_credit: "Reimbursement",
  manual_adjustment: "Adjustment",
};

export const dynamic = "force-dynamic";

export default async function PlayerPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();

  const { data: player } = await db
    .from("players")
    .select("*")
    .eq("public_token", token)
    .single();
  if (!player) notFound();
  const p = player as Player;
  const today = new Date().toISOString().slice(0, 10);

  const { data: memberships } = await db
    .from("player_group_members")
    .select("player_group_id, end_date, player_groups!inner(id, name, type, public_token)")
    .eq("player_id", p.id)
    .in("player_groups.type", ["couple", "family", "team_fund"])
    .is("end_date", null);

  const pooled = (memberships ?? [])[0] as unknown as
    | {
        player_group_id: string;
        player_groups: { id: string; name: string; public_token: string };
      }
    | undefined;

  let balance = 0;
  let ledger: LedgerEntry[] = [];
  if (pooled) {
    const [{ data: gb }, { data: gl }] = await Promise.all([
      db.from("group_balances").select("*").eq("player_group_id", pooled.player_group_id).single(),
      db.from("ledger_entries").select("*").eq("player_group_id", pooled.player_group_id).order("entry_date"),
    ]);
    balance = Number(gb?.balance ?? 0);
    ledger = (gl ?? []) as LedgerEntry[];
  } else {
    const [{ data: pb }, { data: pl }] = await Promise.all([
      db.from("player_balances").select("*").eq("player_id", p.id).single(),
      db.from("ledger_entries").select("*").eq("player_id", p.id).order("entry_date"),
    ]);
    balance = Number(pb?.balance ?? 0);
    ledger = (pl ?? []) as LedgerEntry[];
  }

  const { data: attendance } = await db
    .from("booking_attendance")
    .select(
      "*, bookings(id, booking_code, play_date, start_time, end_time, venue, court_number, status)",
    )
    .eq("player_id", p.id);

  type AttRow = BookingAttendance & { bookings: Booking };
  const att = (attendance ?? []) as AttRow[];
  const upcoming = att
    .filter((a) => a.bookings && a.bookings.play_date >= today && a.bookings.status === "booked")
    .sort((a, b) => a.bookings.play_date.localeCompare(b.bookings.play_date));
  const history = att
    .filter((a) => a.bookings && !(a.bookings.play_date >= today && a.bookings.status === "booked"))
    .sort((a, b) => b.bookings.play_date.localeCompare(a.bookings.play_date));

  const d = describeBalance(balance);
  const ledgerContext = await buildLedgerBookingContext(db, ledger);

  const { data: settings } = await db
    .from("app_settings")
    .select("roster_token, roster_public")
    .single();
  const teamToken =
    settings?.roster_public && settings.roster_token
      ? settings.roster_token
      : null;

  const orderedLedger = [...ledger].sort((a, b) => {
    const byDate = a.entry_date.localeCompare(b.entry_date);
    return byDate !== 0 ? byDate : a.created_at.localeCompare(b.created_at);
  });
  let runningBalance = 0;
  const statement: { entry: LedgerEntry; running: number }[] = [];
  for (const e of orderedLedger) {
    if (!e.voided)
      runningBalance += Number(e.debit_amount) - Number(e.credit_amount);
    statement.push({ entry: e, running: runningBalance });
  }
  statement.reverse();

  return (
    <main className={publicMainClass}>
      <ScrollToHash />
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
          🏓
        </div>
        <h1 className={`text-2xl ${publicPrimaryText}`}>
          {p.display_name || p.name}
        </h1>
        <p className={`mt-0.5 ${publicMetaText}`}>Dinkering Pickleball</p>
      </header>

      <Card
        className={`mb-5 p-6 text-center ${
          d.tone === "collect"
            ? "border-rose-200 bg-rose-50"
            : d.tone === "credit"
              ? "border-emerald-200 bg-emerald-50"
              : "bg-white"
        }`}
      >
        {d.tone === "collect" ? (
          <>
            <p className="text-base font-medium text-rose-800">You currently owe</p>
            <p className="mt-1 text-4xl font-bold text-rose-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : d.tone === "credit" ? (
          <>
            <p className="text-base font-medium text-emerald-800">You have credit</p>
            <p className="mt-1 text-4xl font-bold text-emerald-700">
              {formatMoney(d.amount)}
            </p>
            <p className="mt-1.5 text-sm font-medium text-emerald-700">
              Applied automatically to future charges
            </p>
          </>
        ) : (
          <>
            <p className={`text-base ${publicMetaText}`}>Your balance</p>
            <p className="mt-1 text-4xl font-bold text-slate-800">Settled 🎉</p>
          </>
        )}
        {pooled ? (
          <p className="mt-3 rounded-lg bg-white/70 px-3 py-2.5 text-sm text-slate-600">
            Shared balance with{" "}
            <Link
              href={`/g/${pooled.player_groups.public_token}`}
              className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 active:text-emerald-900"
            >
              {pooled.player_groups.name}
            </Link>
          </p>
        ) : null}
      </Card>

      {teamToken ? (
        <nav className="mb-5 flex flex-wrap justify-center gap-2">
          <PublicNavLink href={`/board/${teamToken}`}>Team balances</PublicNavLink>
          <PublicNavLink href={`/schedule/${teamToken}`}>Upcoming games</PublicNavLink>
        </nav>
      ) : null}

      <PublicSection title="Upcoming games">
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming games" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => {
              const ctx = formatBookingContext(a.bookings);
              return (
                <Card key={a.id} id={`booking-${a.bookings.id}`} className="scroll-mt-6 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg ${publicPrimaryText}`}>
                        {formatDate(a.bookings.play_date)}
                      </p>
                      {a.bookings.booking_code ? (
                        <p className={`mt-0.5 text-sm font-medium text-emerald-800`}>
                          {a.bookings.booking_code}
                        </p>
                      ) : null}
                      {ctx ? (
                        <p className={`mt-1 ${publicHintText}`}>{ctx}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={a.response_status} size="md" />
                  </div>
                  <RsvpForm
                    token={token}
                    bookingId={a.bookings.id}
                    currentStatus={a.response_status}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </PublicSection>

      <PublicSection title="Charges & payments">
        {statement.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <>
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {statement.map(({ entry, running }) => {
                const ctx = formatBookingContext(ledgerContext.get(entry.id));
                const charge = Number(entry.debit_amount);
                const credit = Number(entry.credit_amount);
                const isCharge = charge > 0;
                const balLabel =
                  Math.abs(running) < SETTLE_TOLERANCE
                    ? "Settled"
                    : running > 0
                      ? `${formatMoney(running)} owed`
                      : `${formatMoney(-running)} credit`;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-start justify-between gap-3 px-4 py-3.5 ${
                      entry.voided ? "text-slate-400 line-through" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-base ${publicPrimaryText}`}>
                        {entry.description ||
                          STATEMENT_LABELS[entry.source_type] ||
                          "Entry"}
                      </p>
                      <p className={`mt-0.5 ${publicHintText}`}>
                        {formatDate(entry.entry_date)}
                        {ctx ? ` · ${ctx}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-base font-bold ${
                          isCharge ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {isCharge
                          ? formatMoney(charge)
                          : `− ${formatMoney(credit)}`}
                      </p>
                      {!entry.voided ? (
                        <p className={`mt-0.5 text-sm font-medium ${
                          Math.abs(running) < SETTLE_TOLERANCE
                            ? "text-slate-500"
                            : running > 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                        }`}>
                          {balLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </Card>
            <p className={`mt-2.5 px-1 ${publicHintText}`}>
              Charges in <span className="font-semibold text-rose-700">red</span>,
              payments in{" "}
              <span className="font-semibold text-emerald-700">green</span>. Grey
              line = running balance.
            </p>
          </>
        )}
      </PublicSection>

      <PublicSection title="Appearance history">
        {history.length === 0 ? (
          <EmptyState title="No past games yet" />
        ) : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {history.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div>
                  <span className={`text-base ${publicPrimaryText}`}>
                    {a.bookings.booking_code}
                  </span>
                  <span className={`ml-2 ${publicHintText}`}>
                    {formatDate(a.bookings.play_date)}
                  </span>
                </div>
                <StatusBadge
                  status={a.actual_status ?? a.response_status}
                  size="md"
                />
              </div>
            ))}
          </Card>
        )}
      </PublicSection>

      <footer className="mt-8 text-center text-sm text-slate-400">
        Private link · do not share publicly
      </footer>
    </main>
  );
}
