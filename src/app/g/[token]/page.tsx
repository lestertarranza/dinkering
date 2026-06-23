import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Badge, EmptyState } from "@/components/ui";
import { LedgerTable } from "@/components/LedgerTable";
import { formatMoney, formatDate, describeBalance } from "@/lib/format";
import {
  buildLedgerBookingContext,
  formatBookingContext,
} from "@/lib/booking-context";
import {
  PublicSection,
  publicMainClass,
  publicPrimaryText,
  publicHintText,
} from "@/components/public-ui";
import type {
  BookingShare,
  LedgerEntry,
  Payment,
  PlayerGroup,
  TeamExpenseShare,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GroupPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();

  const { data: group } = await db
    .from("player_groups")
    .select("*")
    .eq("public_token", token)
    .single();
  if (!group) notFound();
  const g = group as PlayerGroup;

  const [
    { data: bal },
    { data: ledger },
    { data: members },
    { data: bShares },
    { data: eShares },
    { data: payments },
  ] = await Promise.all([
    db.from("group_balances").select("*").eq("player_group_id", g.id).single(),
    db.from("ledger_entries").select("*").eq("player_group_id", g.id).order("entry_date"),
    db
      .from("player_group_members")
      .select("is_primary, players(name)")
      .eq("player_group_id", g.id)
      .is("end_date", null),
    db
      .from("booking_shares")
      .select(
        "*, players(name), bookings(booking_code, play_date, start_time, end_time, venue, court_number)",
      )
      .eq("player_group_id", g.id),
    db
      .from("team_expense_shares")
      .select("*, players(name), team_expenses(description, purchase_date)")
      .eq("player_group_id", g.id),
    db
      .from("payments")
      .select("*, players(name)")
      .eq("payer_group_id", g.id)
      .order("payment_date", { ascending: false }),
  ]);

  const balance = Number(bal?.balance ?? 0);
  const d = describeBalance(balance);
  const ledgerContext = await buildLedgerBookingContext(
    db,
    (ledger ?? []) as LedgerEntry[],
  );

  return (
    <main className={publicMainClass}>
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
          👥
        </div>
        <h1 className={`text-2xl ${publicPrimaryText}`}>{g.name}</h1>
        <p className="mt-0.5 text-base text-slate-600">Shared pickleball wallet</p>
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
            <p className="text-base font-medium text-rose-800">This group owes</p>
            <p className="mt-1 text-4xl font-bold text-rose-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : d.tone === "credit" ? (
          <>
            <p className="text-base font-medium text-emerald-800">Group credit</p>
            <p className="mt-1 text-4xl font-bold text-emerald-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : (
          <p className="text-3xl font-bold text-slate-800">Settled 🎉</p>
        )}
      </Card>

      <PublicSection title="Members">
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {(members ?? []).length === 0 ? (
              <span className="text-sm text-slate-400">No members</span>
            ) : (
              (members as unknown as { is_primary: boolean; players: { name: string } }[]).map(
                (m, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <Badge tone={m.is_primary ? "info" : "neutral"}>
                      {m.players?.name}
                    </Badge>
                  </span>
                ),
              )
            )}
          </div>
        </Card>
      </PublicSection>

      <PublicSection title="Charges by member">
        {(bShares ?? []).length === 0 && (eShares ?? []).length === 0 ? (
          <EmptyState title="No charges yet" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {(
              bShares as (BookingShare & {
                players: { name: string } | null;
                bookings:
                  | {
                      booking_code: string;
                      play_date: string;
                      start_time: string | null;
                      end_time: string | null;
                      venue: string | null;
                      court_number: string | null;
                    }
                  | null;
              })[]
            ).map((s) => {
              const ctx = formatBookingContext(s.bookings);
              return (
                <Row
                  key={s.id}
                  left={s.players?.name ?? "—"}
                  sub={`${s.bookings?.booking_code ?? "Court"} · ${formatDate(
                    s.bookings?.play_date,
                  )}${ctx ? ` · ${ctx}` : ""}`}
                  amount={Number(s.amount_owed)}
                />
              );
            })}
            {(
              eShares as (TeamExpenseShare & {
                players: { name: string } | null;
                team_expenses: {
                  description: string;
                  purchase_date: string;
                } | null;
              })[]
            ).map((s) => (
              <Row
                key={s.id}
                left={s.players?.name ?? "—"}
                sub={`${s.team_expenses?.description ?? "Expense"} · ${formatDate(
                  s.team_expenses?.purchase_date,
                )}`}
                amount={Number(s.amount_owed)}
              />
            ))}
          </Card>
        )}
      </PublicSection>

      <PublicSection title="Payments by member">
        {(payments ?? []).length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {(payments as (Payment & { players: { name: string } | null })[]).map(
              (pay) => (
                <Row
                  key={pay.id}
                  left={pay.players?.name ?? g.name}
                  sub={`${formatDate(pay.payment_date)}${
                    pay.payment_method ? ` · ${pay.payment_method}` : ""
                  }`}
                  amount={-Number(pay.amount)}
                />
              ),
            )}
          </Card>
        )}
      </PublicSection>

      <PublicSection title="Shared ledger">
        <Card className="overflow-hidden">
          <LedgerTable
            entries={(ledger ?? []) as LedgerEntry[]}
            bookingContext={ledgerContext}
          />
        </Card>
      </PublicSection>

      <footer className="mt-8 text-center text-sm text-slate-400">
        Private link · do not share publicly
      </footer>
    </main>
  );
}

function Row({
  left,
  sub,
  amount,
}: {
  left: string;
  sub: string;
  amount: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className={`text-base ${publicPrimaryText}`}>{left}</p>
        <p className={`mt-0.5 ${publicHintText}`}>{sub}</p>
      </div>
      <span
        className={`shrink-0 text-base font-bold ${
          amount < 0 ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        {amount < 0
          ? formatMoney(Math.abs(amount))
          : formatMoney(amount)}
      </span>
    </div>
  );
}
