import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Badge, EmptyState } from "@/components/ui";
import { LedgerTable } from "@/components/LedgerTable";
import { formatMoney, formatDate, describeBalance } from "@/lib/format";
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
      .select("*, players(name), bookings(booking_code, play_date)")
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

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl">
          👥
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{g.name}</h1>
        <p className="text-sm text-slate-500">Shared pickleball wallet</p>
      </header>

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
            <p className="text-sm text-rose-700">This group owes</p>
            <p className="mt-1 text-3xl font-bold text-rose-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : d.tone === "credit" ? (
          <>
            <p className="text-sm text-emerald-700">Group credit</p>
            <p className="mt-1 text-3xl font-bold text-emerald-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : (
          <p className="text-2xl font-bold text-slate-700">Settled 🎉</p>
        )}
      </Card>

      <Section title="Members">
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
      </Section>

      <Section title="Charges by member">
        {(bShares ?? []).length === 0 && (eShares ?? []).length === 0 ? (
          <EmptyState title="No charges yet" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {(
              bShares as (BookingShare & {
                players: { name: string } | null;
                bookings: { booking_code: string; play_date: string } | null;
              })[]
            ).map((s) => (
              <Row
                key={s.id}
                left={s.players?.name ?? "—"}
                sub={`${s.bookings?.booking_code ?? "Court"} · ${formatDate(
                  s.bookings?.play_date,
                )}`}
                amount={Number(s.amount_owed)}
              />
            ))}
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
      </Section>

      <Section title="Payments by member">
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
      </Section>

      <Section title="Shared ledger">
        <Card className="overflow-hidden">
          <LedgerTable entries={(ledger ?? []) as LedgerEntry[]} />
        </Card>
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
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span>
        <span className="font-medium text-slate-700">{left}</span>
        <span className="ml-2 text-xs text-slate-400">{sub}</span>
      </span>
      <span
        className={`font-medium ${
          amount < 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {amount < 0
          ? formatMoney(Math.abs(amount))
          : formatMoney(amount)}
      </span>
    </div>
  );
}
