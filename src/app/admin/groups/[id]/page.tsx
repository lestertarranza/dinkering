import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  Badge,
  Field,
  inputClass,
  buttonClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyLink } from "@/components/CopyLink";
import { LedgerTable } from "@/components/LedgerTable";
import { formatMoney, describeBalance } from "@/lib/format";
import { addManualAdjustment } from "../../players/actions";
import type { LedgerEntry, Player, PlayerGroup } from "@/lib/types";
import {
  updateGroup,
  addMember,
  removeMember,
  setPrimaryMember,
  regenerateGroupToken,
  deleteGroup,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function GroupDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("player_groups")
    .select("*")
    .eq("id", id)
    .single();
  if (!group) notFound();
  const g = group as PlayerGroup;

  const [{ data: bal }, { data: ledger }, { data: members }, { data: allPlayers }] =
    await Promise.all([
      supabase.from("group_balances").select("*").eq("player_group_id", id).single(),
      supabase
        .from("ledger_entries")
        .select("*")
        .eq("player_group_id", id)
        .order("entry_date"),
      supabase
        .from("player_group_members")
        .select("*, players(id, name)")
        .eq("player_group_id", id)
        .is("end_date", null),
      supabase
        .from("players")
        .select("id, name")
        .eq("active_status", "active")
        .order("name"),
    ]);

  const memberList = (members ?? []) as {
    id: string;
    is_primary: boolean;
    players: Pick<Player, "id" | "name">;
  }[];
  const memberPlayerIds = new Set(memberList.map((m) => m.players.id));
  const availablePlayers = (
    (allPlayers ?? []) as Pick<Player, "id" | "name">[]
  ).filter((p) => !memberPlayerIds.has(p.id));

  const balance = Number(bal?.balance ?? 0);
  const d = describeBalance(balance);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = `${appUrl}/g/${g.public_token}`;

  return (
    <div>
      <PageHeader
        title={g.name}
        action={
          <Link href="/admin/groups" className={buttonClass("ghost")}>
            ← All groups
          </Link>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Group balance
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
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Public group link
            </h2>
            <p className="mb-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {shareUrl}
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyLink url={shareUrl} />
              <Link
                href={`/g/${g.public_token}`}
                target="_blank"
                className={buttonClass("secondary")}
              >
                Open portal ↗
              </Link>
              <form action={regenerateGroupToken}>
                <input type="hidden" name="id" value={g.id} />
                <SubmitButton variant="ghost">Regenerate token</SubmitButton>
              </form>
            </div>
          </Card>

          <Card>
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Shared ledger
            </h2>
            <LedgerTable entries={(ledger ?? []) as LedgerEntry[]} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-700">
              Members
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Members share one pooled wallet. The{" "}
              <span className="font-medium text-slate-500">Primary</span> member
              is the main contact / default payer — there is only one per group.
            </p>
            {memberList.length === 0 ? (
              <p className="mb-3 text-sm text-slate-400">No members yet.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {memberList.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <Link
                        href={`/admin/players/${m.players.id}`}
                        className="text-sm font-medium text-emerald-700 hover:underline"
                      >
                        {m.players.name}
                      </Link>
                      {m.is_primary ? (
                        <span className="ml-2">
                          <Badge tone="info">Primary</Badge>
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      {!m.is_primary ? (
                        <form action={setPrimaryMember}>
                          <input
                            type="hidden"
                            name="membership_id"
                            value={m.id}
                          />
                          <input
                            type="hidden"
                            name="player_group_id"
                            value={g.id}
                          />
                          <SubmitButton variant="ghost">
                            Make primary
                          </SubmitButton>
                        </form>
                      ) : null}
                      <ConfirmButton
                        action={removeMember}
                        message="Remove this member from the group?"
                        variant="ghost"
                        hidden={{ membership_id: m.id, player_group_id: g.id }}
                      >
                        Remove
                      </ConfirmButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {availablePlayers.length === 0 ? (
              <p className="text-xs text-slate-400">
                All active players are already members.
              </p>
            ) : (
              <form action={addMember} className="space-y-2">
                <input type="hidden" name="player_group_id" value={g.id} />
                <select name="player_id" required className={inputClass}>
                  <option value="">Add a player…</option>
                  {availablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="is_primary" /> Make primary
                  member
                </label>
                <SubmitButton variant="secondary" className="w-full">
                  Add member
                </SubmitButton>
              </form>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Edit group
            </h2>
            <form action={updateGroup} className="space-y-3">
              <input type="hidden" name="id" value={g.id} />
              <Field label="Name">
                <input
                  name="name"
                  defaultValue={g.name}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Type">
                <select name="type" defaultValue={g.type} className={inputClass}>
                  <option value="couple">Couple</option>
                  <option value="family">Family</option>
                  <option value="team_fund">Team fund</option>
                  <option value="individual">Individual</option>
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  name="notes"
                  defaultValue={g.notes ?? ""}
                  rows={2}
                  className={inputClass}
                />
              </Field>
              <SubmitButton className="w-full">Save</SubmitButton>
            </form>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Manual adjustment
            </h2>
            <form action={addManualAdjustment} className="space-y-3">
              <input type="hidden" name="player_group_id" value={g.id} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Type">
                  <select name="type" className={inputClass}>
                    <option value="charge">Charge</option>
                    <option value="credit">Credit</option>
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
              <Field label="Reason (required)">
                <input name="reason" required className={inputClass} />
              </Field>
              <SubmitButton variant="secondary" className="w-full">
                Post adjustment
              </SubmitButton>
            </form>
          </Card>

          <Card className="border-rose-200 p-4">
            <h2 className="mb-2 text-sm font-semibold text-rose-700">
              Danger zone
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Groups with ledger history cannot be deleted.
            </p>
            <ConfirmButton
              action={deleteGroup}
              message={`Delete ${g.name}? Only allowed if it has no ledger history.`}
              hidden={{ id: g.id }}
            >
              Delete group
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </div>
  );
}
