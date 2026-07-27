import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatMoney, formatDate, isSettled } from "@/lib/format";
import { round2 } from "@/lib/ledger";
import { computeExpenseShareRemaining } from "@/lib/payment-allocation";
import type { TeamExpense } from "@/lib/types";
import { ExpenseForm } from "./ExpenseForm";
import { createExpense } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const [{ data: expenses }, { data: players }, { data: groups }, { data: bookings }] =
    await Promise.all([
      supabase
        .from("team_expenses")
        .select("*, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)")
        .order("purchase_date", { ascending: false }),
      supabase
        .from("players")
        .select("id, name")
        .neq("active_status", "archived")
        .order("name"),
      supabase.from("player_groups").select("id, name").order("name"),
      supabase
        .from("bookings")
        .select("id, booking_code, play_date")
        .order("play_date", { ascending: false })
        .limit(50),
    ]);

  const expenseList = (expenses ?? []) as (TeamExpense & {
    players: { name: string } | null;
    player_groups: { name: string } | null;
  })[];

  // Per-expense settlement: sum each active expense's shares' still-open amount.
  const activeIds = expenseList
    .filter((e) => e.status !== "reversed")
    .map((e) => e.id);
  const { data: shareRows } = activeIds.length
    ? await supabase
        .from("team_expense_shares")
        .select("id, team_expense_id, amount_owed")
        .in("team_expense_id", activeIds)
    : { data: [] as { id: string; team_expense_id: string; amount_owed: number }[] };
  const shares = (shareRows ?? []) as {
    id: string;
    team_expense_id: string;
    amount_owed: number;
  }[];
  const remainingByShare = await computeExpenseShareRemaining(
    supabase,
    shares.map((s) => s.id),
  );
  const settlementByExpense = new Map<
    string,
    { hasShares: boolean; outstanding: number }
  >();
  for (const s of shares) {
    const entry = settlementByExpense.get(s.team_expense_id) ?? {
      hasShares: false,
      outstanding: 0,
    };
    const owed = Number(s.amount_owed);
    const remaining = Math.min(owed, remainingByShare.get(s.id) ?? 0);
    entry.hasShares = true;
    entry.outstanding = round2(entry.outstanding + Math.max(0, remaining));
    settlementByExpense.set(s.team_expense_id, entry);
  }

  return (
    <div>
      <PageHeader
        title="Team Expenses"
        description="Shared purchases like pickleballs. The buyer is credited; the cost is split."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:order-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Add team expense
          </h2>
          <ExpenseForm
            action={createExpense}
            players={players ?? []}
            groups={groups ?? []}
            bookings={bookings ?? []}
          />
        </Card>

        <div className="lg:order-1 lg:col-span-2">
          {expenseList.length === 0 ? (
            <EmptyState
              title="No team expenses yet"
              description="Log a purchase to split it across the team."
            />
          ) : (
            <div className="space-y-2">
              {expenseList.map((e) => {
                const settle = settlementByExpense.get(e.id);
                const reversed = e.status === "reversed";
                const settled =
                  !reversed && !!settle?.hasShares && isSettled(settle.outstanding);
                const outstanding = settle?.outstanding ?? 0;
                return (
                  <Link
                    key={e.id}
                    href={`/admin/expenses/${e.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        {e.description}
                        {reversed ? (
                          <Badge tone="neutral">Reversed</Badge>
                        ) : !settle?.hasShares ? (
                          <Badge tone="warning">Not split</Badge>
                        ) : settled ? (
                          <Badge tone="going">Settled</Badge>
                        ) : (
                          <Badge tone="collect">
                            {formatMoney(outstanding)} due
                          </Badge>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {e.expense_code} · {formatDate(e.purchase_date)} · paid by{" "}
                        {e.players?.name ?? e.player_groups?.name ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-slate-900">
                        {formatMoney(e.total_cost)}
                      </p>
                      {!reversed && settle?.hasShares ? (
                        <p
                          className={`mt-0.5 text-xs font-medium ${
                            settled ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {settled ? "Fully collected" : `${formatMoney(outstanding)} outstanding`}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
