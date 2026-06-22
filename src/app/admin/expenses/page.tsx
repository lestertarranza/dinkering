import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/format";
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
          {(expenses ?? []).length === 0 ? (
            <EmptyState
              title="No team expenses yet"
              description="Log a purchase to split it across the team."
            />
          ) : (
            <div className="space-y-2">
              {(
                expenses as (TeamExpense & {
                  players: { name: string } | null;
                  player_groups: { name: string } | null;
                })[]
              ).map((e) => (
                <Link
                  key={e.id}
                  href={`/admin/expenses/${e.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      {e.description}
                      {e.status === "reversed" ? (
                        <Badge tone="neutral">Reversed</Badge>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {e.expense_code} · {formatDate(e.purchase_date)} · paid by{" "}
                      {e.players?.name ?? e.player_groups?.name ?? "—"}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-900">
                    {formatMoney(e.total_cost)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
