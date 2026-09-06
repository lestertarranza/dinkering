import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  Badge,
  Field,
  inputClass,
  EmptyState,
} from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney, formatDate } from "@/lib/format";
import { fundBalanceFromEntries } from "@/lib/club-funds";
import type { ClubFundEntry, ClubItemFund, TeamExpense } from "@/lib/types";
import { addFundEntry, updateFund, voidFundEntry } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClubFundDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: fund }, { data: entries }, { data: expenses }] =
    await Promise.all([
      supabase.from("club_item_funds").select("*").eq("id", id).single(),
      supabase
        .from("club_fund_entries")
        .select("*")
        .eq("fund_id", id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("team_expenses")
        .select("id, expense_code, description, purchase_date")
        .order("purchase_date", { ascending: false })
        .limit(40),
    ]);

  if (!fund) notFound();
  const f = fund as ClubItemFund;
  const list = (entries ?? []) as ClubFundEntry[];
  const balance = fundBalanceFromEntries(list);
  const target = Number(f.target_amount) || 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : null;
  const today = new Date().toISOString().slice(0, 10);
  const expenseList = (expenses ?? []) as Pick<
    TeamExpense,
    "id" | "expense_code" | "description" | "purchase_date"
  >[];

  return (
    <div>
      <PageHeader
        title={f.name}
        description="Add money you have set aside. Record a purchase to deduct it."
        action={
          <Link
            href="/admin/funds"
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            All club items
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Dedicated now
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatMoney(balance)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Target
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {target > 0 ? formatMoney(target) : "—"}
          </p>
          {pct !== null ? (
            <p className="mt-1 text-xs text-slate-400">{pct}% funded</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No target set</p>
          )}
        </Card>
        <Card className="flex items-center p-4">
          {f.status === "archived" ? (
            <Badge>Archived</Badge>
          ) : (
            <Badge tone="going">Active</Badge>
          )}
        </Card>
      </div>

      {pct !== null ? (
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:order-2">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Add money
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Use this when you earmark collected cash or surplus for this item.
            </p>
            <ActionForm action={addFundEntry} className="space-y-3">
              <input type="hidden" name="fund_id" value={f.id} />
              <input type="hidden" name="kind" value="allocate" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount">
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Date">
                  <input
                    name="entry_date"
                    type="date"
                    defaultValue={today}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Note" hint="e.g. extra ₱20 from Sunday sessions">
                <input name="description" className={inputClass} />
              </Field>
              <SubmitButton>Add to fund</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Record purchase
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Deducts from this pot when you buy the item. Does not charge players.
              Use Team Expenses if you still need to split a receipt.
            </p>
            <ActionForm action={addFundEntry} className="space-y-3">
              <input type="hidden" name="fund_id" value={f.id} />
              <input type="hidden" name="kind" value="spend" />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount">
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Date">
                  <input
                    name="entry_date"
                    type="date"
                    defaultValue={today}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="What you bought">
                <input
                  name="description"
                  placeholder="e.g. 3 tubes of Franklin balls"
                  className={inputClass}
                />
              </Field>
              {expenseList.length > 0 ? (
                <Field
                  label="Link a team expense (optional)"
                  hint="Only if you also logged the receipt under Team Expenses"
                >
                  <select name="team_expense_id" className={inputClass}>
                    <option value="">None</option>
                    {expenseList.map((e) => (
                      <option key={e.id} value={e.id}>
                        {(e.expense_code ?? "EXP") + " · "}
                        {e.description} ({formatDate(e.purchase_date)})
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <SubmitButton variant="secondary">Deduct purchase</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Fund settings
            </h2>
            <ActionForm action={updateFund} className="space-y-3">
              <input type="hidden" name="id" value={f.id} />
              <Field label="Name">
                <input
                  name="name"
                  required
                  defaultValue={f.name}
                  className={inputClass}
                />
              </Field>
              <Field label="Target amount">
                <input
                  name="target_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={f.target_amount ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={f.notes ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Status">
                <select
                  name="status"
                  defaultValue={f.status}
                  className={inputClass}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <div className="lg:order-1 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">History</h2>
          {list.length === 0 ? (
            <EmptyState
              title="No money in this fund yet"
              description="Add the amount you currently have dedicated, then deduct when you buy."
            />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {list.map((e) => (
                <div
                  key={e.id}
                  className={`flex items-start justify-between gap-3 px-4 py-3 ${
                    e.voided ? "opacity-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {e.kind === "allocate" ? "Added" : "Purchase"}
                      {e.voided ? " · voided" : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(e.entry_date)}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                    {e.team_expense_id ? (
                      <Link
                        href={`/admin/expenses/${e.team_expense_id}`}
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        Linked expense
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`font-semibold ${
                        e.kind === "allocate"
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {e.kind === "allocate" ? "+" : "−"}
                      {formatMoney(e.amount)}
                    </span>
                    {!e.voided ? (
                      <ConfirmButton
                        action={voidFundEntry}
                        message="Void this entry? It will no longer count toward the balance."
                        variant="ghost"
                        pendingLabel="Voiding…"
                        hidden={{ id: e.id, fund_id: f.id }}
                      >
                        Void
                      </ConfirmButton>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
