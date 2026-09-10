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
import { formatMoney, formatDate, SETTLE_TOLERANCE, isSettled } from "@/lib/format";
import {
  loadClubFundCashSummaries,
  loadClubFundShareAudit,
} from "@/lib/club-fund-cash";
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

  const [
    { data: fund },
    { data: entries },
    { data: players },
    { data: groups },
    cashBundle,
    shareAudit,
  ] = await Promise.all([
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
    loadClubFundCashSummaries(supabase, [id]),
    loadClubFundShareAudit(supabase, id),
  ]);

  if (!fund) notFound();
  const f = fund as ClubItemFund;
  const list = (entries ?? []) as (ClubFundEntry & {
    players: { name: string } | null;
    player_groups: { name: string } | null;
    bookings: { id: string; booking_code: string | null } | null;
  })[];
  const cash = cashBundle.byFund.get(id) ?? {
    billed: 0,
    collected: 0,
    unpaid: 0,
    manualIn: 0,
    spent: 0,
    available: 0,
  };
  const balance = cash.available;
  const overdrawn = balance < -SETTLE_TOLERANCE;
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
        description="Charge games into this pot. The pot only grows when players pay. When someone buys the item, credit their wallet from collected cash."
        action={
          <Link
            href="/admin/funds"
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            All club items
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            In pot
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
              Overdrawn. Future collected contributions refill this.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Collected plus donations, minus purchases
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Collected
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatMoney(cash.collected)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Of {formatMoney(cash.billed)} charged
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Unpaid
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              cash.unpaid >= SETTLE_TOLERANCE
                ? "text-rose-700"
                : "text-slate-900"
            }`}
          >
            {formatMoney(cash.unpaid)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Charged but not yet paid
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
          ) : f.status === "archived" ? (
            <Badge>Archived</Badge>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No target set</p>
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
              contributions are charged from a booking and count here after they
              pay.
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
              the full amount. If collected cash is short, the pot goes
              overdrawn and stays on the audit trail.
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
          {shareAudit.length > 0 ? (
            <Card className="mb-5">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  Who has paid
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Same FIFO as court fees. Collected is money actually paid, not
                  the amount charged.
                </p>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 font-medium">Player</th>
                      <th className="py-2 font-medium">Game</th>
                      <th className="py-2 text-right font-medium">Charged</th>
                      <th className="py-2 text-right font-medium">Paid</th>
                      <th className="py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shareAudit.map((row) => {
                      const settled = isSettled(row.remaining);
                      return (
                        <tr key={row.shareId}>
                          <td className="py-2 font-medium text-slate-700">
                            {row.playerName}
                          </td>
                          <td className="py-2 text-slate-600">
                            {row.bookingId ? (
                              <Link
                                href={`/admin/bookings/${row.bookingId}`}
                                className="text-emerald-700 hover:underline"
                              >
                                {row.bookingCode ?? "Booking"}
                              </Link>
                            ) : (
                              "—"
                            )}
                            {row.playDate ? (
                              <span className="ml-1 text-xs text-slate-400">
                                {formatDate(row.playDate)}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-right text-slate-600">
                            {formatMoney(row.amount)}
                          </td>
                          <td className="py-2 text-right text-emerald-700">
                            {row.paid > 0 ? formatMoney(row.paid) : "—"}
                          </td>
                          <td
                            className={`py-2 text-right font-medium ${
                              settled
                                ? "text-slate-400"
                                : "text-rose-700"
                            }`}
                          >
                            {settled
                              ? "Settled"
                              : `${formatMoney(row.remaining)} due`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <h2 className="mb-3 text-sm font-semibold text-slate-700">History</h2>
          {list.length === 0 ? (
            <EmptyState
              title="No money in this fund yet"
              description="Charge a game contribution, or add opening cash you already have."
            />
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {list.map((e) => {
                const entryCash = cashBundle.byEntry.get(e.id);
                const isGame = e.kind === "allocate" && Boolean(e.booking_id);
                return (
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
                        : isGame
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
                    {isGame && entryCash && !e.voided ? (
                      <p className="text-xs text-slate-500">
                        Charged {formatMoney(entryCash.billed)} · collected{" "}
                        {formatMoney(entryCash.collected)}
                        {entryCash.unpaid >= SETTLE_TOLERANCE
                          ? ` · ${formatMoney(entryCash.unpaid)} unpaid`
                          : " · all paid"}
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
                        e.kind === "spend"
                          ? "text-rose-700"
                          : isGame
                            ? "text-slate-700"
                            : "text-emerald-700"
                      }`}
                    >
                      {e.kind === "spend"
                        ? `−${formatMoney(e.amount)}`
                        : isGame
                          ? `charged ${formatMoney(e.amount)}`
                          : `+${formatMoney(e.amount)}`}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
