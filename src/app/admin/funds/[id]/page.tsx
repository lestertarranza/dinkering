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
import type { ClubFundEntry, ClubItemFund } from "@/lib/types";
import {
  addFundMoney,
  recordFundPurchase,
  updateFund,
  voidFundEntry,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ClubFundDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: fund }, { data: entries }, { data: players }, { data: groups }] =
    await Promise.all([
      supabase.from("club_item_funds").select("*").eq("id", id).single(),
      supabase
        .from("club_fund_entries")
        .select(
          "*, players:paid_by_player_id(name), player_groups:paid_by_group_id(name), bookings:booking_id(id, booking_code)",
        )
        .eq("fund_id", id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("players")
        .select("id, name")
        .neq("active_status", "archived")
        .order("name"),
      supabase.from("player_groups").select("id, name").order("name"),
    ]);

  if (!fund) notFound();
  const f = fund as ClubItemFund;
  const list = (entries ?? []) as (ClubFundEntry & {
    players: { name: string } | null;
    player_groups: { name: string } | null;
    bookings: { id: string; booking_code: string | null } | null;
  })[];
  const balance = fundBalanceFromEntries(list);
  const overdrawn = balance < -0.005;
  const target = Number(f.target_amount) || 0;
  const pct =
    target > 0 && balance > 0
      ? Math.min(100, Math.round((balance / target) * 100))
      : target > 0
        ? 0
        : null;
  const today = new Date().toISOString().slice(0, 10);
  const playerOpts = (players ?? []) as { id: string; name: string }[];
  const groupOpts = (groups ?? []) as { id: string; name: string }[];

  return (
    <div>
      <PageHeader
        title={f.name}
        description="Charge games into this pot. When someone buys the item, credit their wallet from the fund."
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
          <p
            className={`mt-1 text-2xl font-semibold ${
              overdrawn ? "text-rose-700" : "text-emerald-700"
            }`}
          >
            {overdrawn ? `−${formatMoney(-balance)}` : formatMoney(balance)}
          </p>
          {overdrawn ? (
            <p className="mt-1 text-xs text-rose-600">
              Overdrawn. Future game contributions refill this.
            </p>
          ) : null}
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
              Opening cash or a donation. Does not charge players. Game
              contributions are added from a booking.
            </p>
            <ActionForm action={addFundMoney} className="space-y-3">
              <input type="hidden" name="fund_id" value={f.id} />
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
              Anyone who bought this for the club. They get a wallet credit for
              the full amount. If the pot is short, it goes overdrawn and stays
              on the audit trail.
            </p>
            <ActionForm action={recordFundPurchase} className="space-y-3">
              <input type="hidden" name="fund_id" value={f.id} />
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
                  required
                  placeholder="e.g. 3 tubes of Franklin X-40"
                  className={inputClass}
                />
              </Field>
              <Field label="Bought by" hint="This player or group is credited">
                <select name="payer" required className={inputClass}>
                  <option value="">Select buyer…</option>
                  {groupOpts.length > 0 ? (
                    <optgroup label="Groups">
                      {groupOpts.map((g) => (
                        <option key={g.id} value={`g:${g.id}`}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="Players">
                    {playerOpts.map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              {overdrawn || balance < 0.01 ? (
                <p className="text-xs text-amber-700">
                  Current pot is {formatMoney(Math.max(0, balance))}. A larger
                  purchase will be tracked as overdrawn.
                </p>
              ) : null}
              <SubmitButton variant="secondary">Record purchase</SubmitButton>
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
                      {e.kind === "spend"
                        ? "Purchase"
                        : e.booking_id
                          ? "Game contribution"
                          : "Added"}
                      {e.voided ? " · voided" : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(e.entry_date)}
                      {e.description ? ` · ${e.description}` : ""}
                    </p>
                    {e.kind === "spend" ? (
                      <p className="text-xs text-slate-500">
                        Bought by{" "}
                        {e.players?.name ?? e.player_groups?.name ?? "unknown"}
                      </p>
                    ) : null}
                    {e.bookings ? (
                      <Link
                        href={`/admin/bookings/${e.bookings.id}`}
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        {e.bookings.booking_code ?? "Booking"}
                      </Link>
                    ) : e.team_expense_id ? (
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
                        message="Void this entry? The pot and any player wallet charges or credits will be reversed."
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
