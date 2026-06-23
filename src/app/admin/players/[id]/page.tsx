import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  StatusBadge,
  Badge,
  Field,
  inputClass,
  buttonClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyLink, ShareLink } from "@/components/CopyLink";
import { QrCode } from "@/components/QrCode";
import { LedgerTable } from "@/components/LedgerTable";
import { buildLedgerBookingContext } from "@/lib/booking-context";
import { buildLedgerExpenseContext } from "@/lib/ledger-attribution";
import { formatMoney, describeBalance } from "@/lib/format";
import type { LedgerEntry, Player, PlayerGroup } from "@/lib/types";
import {
  updatePlayer,
  setPlayerStatus,
  regenerateToken,
  assignToGroup,
  removeFromGroup,
  addManualAdjustment,
  deletePlayer,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function PlayerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .single();
  if (!player) notFound();
  const p = player as Player;

  const [{ data: bal }, { data: ledger }, { data: memberships }, { data: groups }] =
    await Promise.all([
      supabase.from("player_balances").select("*").eq("player_id", id).single(),
      supabase
        .from("ledger_entries")
        .select("*")
        .eq("player_id", id)
        .order("entry_date"),
      supabase
        .from("player_group_members")
        .select("*, player_groups(id, name, type)")
        .eq("player_id", id)
        .is("end_date", null),
      supabase.from("player_groups").select("id, name, type").order("name"),
    ]);

  const membershipList = (memberships ?? []) as {
    id: string;
    is_primary: boolean;
    player_groups: Pick<PlayerGroup, "id" | "name" | "type">;
  }[];
  const memberGroupIds = new Set(
    membershipList.map((m) => m.player_groups.id),
  );
  const availableGroups = ((groups ?? []) as PlayerGroup[]).filter(
    (g) => !memberGroupIds.has(g.id),
  );

  const balance = Number(bal?.balance ?? 0);
  const d = describeBalance(balance);
  const ledgerEntries = (ledger ?? []) as LedgerEntry[];
  const [ledgerContext, ledgerExpenseCtx] = await Promise.all([
    buildLedgerBookingContext(supabase, ledgerEntries),
    buildLedgerExpenseContext(supabase, ledgerEntries),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = `${appUrl}/p/${p.public_token}`;

  return (
    <div>
      <PageHeader
        title={p.name}
        description={p.display_name ?? undefined}
        action={
          <Link href="/admin/players" className={buttonClass("ghost")}>
            ← All players
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Balance
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              d.tone === "collect"
                ? "text-rose-600"
                : d.tone === "credit"
                  ? "text-emerald-600"
                  : "text-slate-900"
            }`}
          >
            {d.tone === "settled" ? "Settled" : formatMoney(d.amount)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {d.tone === "collect"
              ? "Owes the team"
              : d.tone === "credit"
                ? "Has wallet credit"
                : "All squared up"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total charges
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(bal?.total_debit ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total paid / credits
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatMoney(bal?.total_credit ?? 0)}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Public link */}
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Public player link
            </h2>
            <p className="mb-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {shareUrl}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
              <div className="flex flex-wrap gap-2">
                <CopyLink url={shareUrl} />
                <ShareLink
                  url={shareUrl}
                  title={`${p.display_name || p.name} — Dinkering`}
                  text="Your Dinkering player page:"
                  label="Share link"
                />
                <Link
                  href={`/p/${p.public_token}`}
                  target="_blank"
                  className={buttonClass("secondary")}
                >
                  Open portal ↗
                </Link>
                <ActionForm
                  action={regenerateToken}
                  pendingLabel="Regenerating token…"
                  hidden={<input type="hidden" name="id" value={p.id} />}
                >
                  <SubmitButton variant="ghost" pendingLabel="Regenerating…">
                    Regenerate token
                  </SubmitButton>
                </ActionForm>
              </div>
              <QrCode url={shareUrl} label="Scan to open player page" />
            </div>
          </Card>

          {/* Ledger */}
          <Card>
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Ledger history
            </h2>
            <LedgerTable
              entries={ledgerEntries}
              bookingContext={ledgerContext}
              expenseContext={ledgerExpenseCtx}
            />
          </Card>
        </div>

        <div className="space-y-5">
          {/* Edit */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Edit details
            </h2>
            <ActionForm action={updatePlayer} className="space-y-3" pendingLabel="Saving…">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Full name">
                <input
                  name="name"
                  defaultValue={p.name}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Display name">
                <input
                  name="display_name"
                  defaultValue={p.display_name ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="Status">
                <select
                  name="active_status"
                  defaultValue={p.active_status}
                  className={inputClass}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  name="notes"
                  defaultValue={p.notes ?? ""}
                  rows={2}
                  className={inputClass}
                />
              </Field>
              <SubmitButton className="w-full" pendingLabel="Saving…">
                Save changes
              </SubmitButton>
            </ActionForm>
            <div className="mt-3 flex items-center gap-2">
              <StatusBadge status={p.active_status} />
              {p.active_status !== "active" ? (
                <ActionForm
                  action={setPlayerStatus}
                  pendingLabel="Reactivating…"
                  hidden={
                    <>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active_status" value="active" />
                    </>
                  }
                >
                  <SubmitButton variant="ghost" pendingLabel="…">
                    Reactivate
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm
                  action={setPlayerStatus}
                  pendingLabel="Deactivating…"
                  hidden={
                    <>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="active_status" value="inactive" />
                    </>
                  }
                >
                  <SubmitButton variant="ghost" pendingLabel="…">
                    Deactivate
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          </Card>

          {/* Groups */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Pooled funds / groups
            </h2>
            {membershipList.length === 0 ? (
              <p className="mb-3 text-sm text-slate-400">
                Not part of any group.
              </p>
            ) : (
              <ul className="mb-3 space-y-2">
                {membershipList.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <Link
                        href={`/admin/groups/${m.player_groups.id}`}
                        className="text-sm font-medium text-emerald-700 hover:underline"
                      >
                        {m.player_groups.name}
                      </Link>
                      {m.is_primary ? (
                        <span className="ml-2">
                          <Badge tone="info">Primary</Badge>
                        </span>
                      ) : null}
                    </div>
                    <ConfirmButton
                      action={removeFromGroup}
                      message="Remove this player from the group?"
                      variant="ghost"
                      hidden={{ membership_id: m.id, player_id: p.id }}
                      pendingLabel="Removing…"
                    >
                      Remove
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            )}
            {availableGroups.length === 0 ? (
              <p className="text-xs text-slate-400">
                No other groups available to join.
              </p>
            ) : (
              <ActionForm action={assignToGroup} className="space-y-2" pendingLabel="Adding…">
                <input type="hidden" name="player_id" value={p.id} />
                <select name="player_group_id" required className={inputClass}>
                  <option value="">Select a group…</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="is_primary" /> Make primary
                  member
                </label>
                <SubmitButton variant="secondary" className="w-full" pendingLabel="Adding…">
                  Add to group
                </SubmitButton>
              </ActionForm>
            )}
          </Card>

          {/* Manual adjustment */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Manual adjustment
            </h2>
            <ActionForm
              action={addManualAdjustment}
              className="space-y-3"
              pendingLabel="Posting adjustment…"
            >
              <input type="hidden" name="player_id" value={p.id} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type">
                  <select name="type" className={inputClass}>
                    <option value="charge">Charge (owes more)</option>
                    <option value="credit">Credit (owes less)</option>
                  </select>
                </Field>
                <Field label="Amount">
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Date">
                <input
                  name="adjustment_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={inputClass}
                />
              </Field>
              <Field label="Reason (required)">
                <input name="reason" required className={inputClass} />
              </Field>
              <SubmitButton variant="secondary" className="w-full" pendingLabel="Posting…">
                Post adjustment
              </SubmitButton>
            </ActionForm>
          </Card>

          {/* Danger zone */}
          <Card className="border-rose-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-rose-700">
              Danger zone
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Players with ledger history are archived (not deleted) to preserve
              the audit trail.
            </p>
            <ConfirmButton
              action={deletePlayer}
              message={`Delete or archive ${p.name}? Financial history is preserved.`}
              hidden={{ id: p.id }}
              pendingLabel="Deleting…"
            >
              Delete / archive player
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
