import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import { LedgerTable } from "@/components/LedgerTable";
import {
  formatMoney,
  formatDate,
  formatTimeRange,
  describeBalance,
} from "@/lib/format";
import type {
  Booking,
  BookingAttendance,
  BookingShare,
  LedgerEntry,
  Payment,
  Player,
  TeamExpenseShare,
} from "@/lib/types";
import { submitRsvp } from "./actions";

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

  // Resolve pooled group (if any) for balance attribution.
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

  // Balance + ledger come from the wallet owner (group if pooled).
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

  const [{ data: attendance }, { data: shares }, { data: expShares }, { data: payments }] =
    await Promise.all([
      db
        .from("booking_attendance")
        .select("*, bookings(id, booking_code, play_date, start_time, end_time, venue, status)")
        .eq("player_id", p.id),
      db
        .from("booking_shares")
        .select("*, bookings(booking_code, play_date)")
        .eq("player_id", p.id),
      db
        .from("team_expense_shares")
        .select("*, team_expenses(description, purchase_date)")
        .eq("player_id", p.id),
      db
        .from("payments")
        .select("*")
        .eq("payer_player_id", p.id)
        .order("payment_date", { ascending: false }),
    ]);

  type AttRow = BookingAttendance & { bookings: Booking };
  const att = (attendance ?? []) as AttRow[];
  const upcoming = att
    .filter((a) => a.bookings && a.bookings.play_date >= today && a.bookings.status === "booked")
    .sort((a, b) => a.bookings.play_date.localeCompare(b.bookings.play_date));
  const history = att
    .filter((a) => a.bookings && !(a.bookings.play_date >= today && a.bookings.status === "booked"))
    .sort((a, b) => b.bookings.play_date.localeCompare(a.bookings.play_date));

  const d = describeBalance(balance);

  const rsvpBtn = (bookingId: string, value: string, label: string, current: string) => (
    <button
      type="submit"
      name="response_status"
      value={value}
      formAction={submitRsvp}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
        current === value
          ? value === "going"
            ? "bg-emerald-600 text-white"
            : value === "maybe"
              ? "bg-amber-500 text-white"
              : "bg-rose-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl">
          🏓
        </div>
        <h1 className="text-xl font-semibold text-slate-900">
          {p.display_name || p.name}
        </h1>
        <p className="text-sm text-slate-500">Dinkering Pickleball</p>
      </header>

      {/* Balance hero */}
      <Card
        className={`mb-4 p-6 text-center ${
          d.tone === "collect"
            ? "border-rose-200 bg-rose-50"
            : d.tone === "credit"
              ? "border-emerald-200 bg-emerald-50"
              : "bg-white"
        }`}
      >
        {d.tone === "collect" ? (
          <>
            <p className="text-sm text-rose-700">You currently owe</p>
            <p className="mt-1 text-3xl font-bold text-rose-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : d.tone === "credit" ? (
          <>
            <p className="text-sm text-emerald-700">You have credit</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">
              {formatMoney(d.amount)}
            </p>
            <p className="mt-1 text-xs text-emerald-600">
              Applied automatically to future charges
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500">Your balance</p>
            <p className="mt-1 text-3xl font-bold text-slate-700">Settled 🎉</p>
          </>
        )}
        {pooled ? (
          <p className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-slate-500">
            This is a shared balance with{" "}
            <a
              href={`/g/${pooled.player_groups.public_token}`}
              className="font-medium text-emerald-700 underline"
            >
              {pooled.player_groups.name}
            </a>
            .
          </p>
        ) : null}
      </Card>

      {/* Upcoming + RSVP */}
      <Section title="Upcoming games">
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming games" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {formatDate(a.bookings.play_date)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.bookings.start_time
                        ? formatTimeRange(
                            a.bookings.start_time,
                            a.bookings.end_time,
                          )
                        : ""}
                      {a.bookings.venue ? ` · ${a.bookings.venue}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={a.response_status} />
                </div>
                <form className="flex gap-2">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="booking_id" value={a.bookings.id} />
                  {rsvpBtn(a.bookings.id, "going", "Going", a.response_status)}
                  {rsvpBtn(a.bookings.id, "maybe", "Maybe", a.response_status)}
                  {rsvpBtn(
                    a.bookings.id,
                    "not_going",
                    "Not going",
                    a.response_status,
                  )}
                </form>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Court shares */}
      <Section title="Court shares">
        {(shares ?? []).length === 0 ? (
          <EmptyState title="No court charges yet" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {(
              shares as (BookingShare & {
                bookings: { booking_code: string; play_date: string } | null;
              })[]
            ).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium text-slate-700">
                    {s.bookings?.booking_code}
                  </span>{" "}
                  <span className="text-slate-400">
                    {formatDate(s.bookings?.play_date)}
                  </span>
                </span>
                <span className="font-medium text-rose-600">
                  {formatMoney(s.amount_owed)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {/* Expense shares */}
      <Section title="Team expense shares">
        {(expShares ?? []).length === 0 ? (
          <EmptyState title="No expense shares" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {(
              expShares as (TeamExpenseShare & {
                team_expenses: {
                  description: string;
                  purchase_date: string;
                } | null;
              })[]
            ).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium text-slate-700">
                    {s.team_expenses?.description}
                  </span>{" "}
                  <span className="text-slate-400">
                    {formatDate(s.team_expenses?.purchase_date)}
                  </span>
                </span>
                <span className="font-medium text-rose-600">
                  {formatMoney(s.amount_owed)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {/* Payments */}
      <Section title="Your payments">
        {(payments ?? []).length === 0 ? (
          <EmptyState title="No payments recorded" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {((payments ?? []) as Payment[]).map((pay) => (
              <div
                key={pay.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  <span className="text-slate-400">
                    {formatDate(pay.payment_date)}
                  </span>
                  {pay.payment_method ? (
                    <span className="ml-2 text-slate-500">
                      {pay.payment_method}
                    </span>
                  ) : null}
                </span>
                <span className="font-medium text-emerald-600">
                  {formatMoney(pay.amount)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </Section>

      {/* Attendance history */}
      <Section title="Appearance history">
        {history.length === 0 ? (
          <EmptyState title="No past games yet" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {history.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium text-slate-700">
                    {a.bookings.booking_code}
                  </span>{" "}
                  <span className="text-slate-400">
                    {formatDate(a.bookings.play_date)}
                  </span>
                </span>
                <StatusBadge status={a.actual_status ?? a.response_status} />
              </div>
            ))}
          </Card>
        )}
      </Section>

      {/* Full ledger */}
      <Section title="Full ledger">
        <Card className="overflow-hidden">
          <LedgerTable entries={ledger} />
        </Card>
        <p className="mt-2 px-1 text-xs text-slate-400">
          Balance = total charges − total payments &amp; credits. A positive
          balance means you owe; a negative balance is credit carried forward.
        </p>
      </Section>

      <footer className="mt-8 text-center text-xs text-slate-300">
        Private link · do not share publicly
      </footer>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
