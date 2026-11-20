import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  StatusBadge,
  Badge,
  Field,
  inputClass,
  buttonClass,
  EmptyState,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyLink, ShareLink } from "@/components/CopyLink";
import { formatMoney, describeBalance } from "@/lib/format";
import type { Player } from "@/lib/types";
import { createPlayer, regenerateRosterToken } from "./actions";
import { playerLinkMap, loadLinkedIdentities, loadInviteIndex } from "@/lib/accounts";
import { PlayerAvatar } from "@/components/public-ui";
import { InviteSelect } from "@/components/InviteSelect";
import { PlayerListFilter } from "@/components/PlayerListFilter";
import {
  inviteLineFromIndex,
  inviteOptionsFromIndex,
} from "@/lib/player-invite";
import { getAccountsReady } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players")
    .select("*")
    .order("name");

  const { data: balances } = await supabase.from("player_balances").select("*");
  const balMap = new Map(
    (balances ?? []).map((b) => [b.player_id as string, Number(b.balance)]),
  );

  const { data: settings } = await supabase
    .from("app_settings")
    .select("roster_token")
    .single();
  const accountsReady = await getAccountsReady();
  const links = accountsReady
    ? await playerLinkMap()
    : { linked: new Map<string, string>(), pendingClaims: new Set<string>() };
  const identities = accountsReady
    ? await loadLinkedIdentities()
    : new Map();
  const inviteIndex = await loadInviteIndex(supabase);
  const inviteOptions = inviteOptionsFromIndex(inviteIndex, identities);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const boardUrl = settings?.roster_token
    ? `${appUrl}/board/${settings.roster_token}`
    : null;
  const scheduleUrl = settings?.roster_token
    ? `${appUrl}/schedule/${settings.roster_token}`
    : null;

  const list = (players ?? []) as Player[];

  return (
    <div>
      <PageHeader
        title="Players"
        description="Add, edit, and manage the people on your team."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:order-2">
          {/* Public team links */}
          <Card className="p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-700">
              Public team links
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Share these with the whole team. Both use the same secure token.
            </p>
            {boardUrl && scheduleUrl ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">
                    Team board (balances)
                  </p>
                  <p className="mb-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    {boardUrl}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <CopyLink url={boardUrl} />
                    <ShareLink
                      url={boardUrl}
                      title="Dinkering team balances"
                      label="Share"
                    />
                    <Link
                      href={`/board/${settings!.roster_token}`}
                      target="_blank"
                      className={buttonClass("secondary")}
                    >
                      Open ↗
                    </Link>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">
                    Upcoming games (schedule &amp; RSVP)
                  </p>
                  <p className="mb-2 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    {scheduleUrl}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <CopyLink url={scheduleUrl} />
                    <ShareLink
                      url={scheduleUrl}
                      title="Dinkering upcoming games"
                      label="Share"
                    />
                    <Link
                      href={`/schedule/${settings!.roster_token}`}
                      target="_blank"
                      className={buttonClass("secondary")}
                    >
                      Open ↗
                    </Link>
                  </div>
                </div>
                <ConfirmButton
                  action={regenerateRosterToken}
                  message="Regenerate the public team token? Existing board and schedule links will stop working for anyone who already has them."
                  variant="ghost"
                  pendingLabel="Regenerating…"
                >
                  Regenerate token (invalidates both links)
                </ConfirmButton>
              </div>
            ) : (
              <p className="text-xs text-rose-500">
                Run the latest database migration to enable public team links.
              </p>
            )}
          </Card>

          {/* Quick add */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Add player
            </h2>
            <form action={createPlayer} className="space-y-3">
              <Field label="Full name">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="Display name" hint="Optional short name / nickname">
                <input name="display_name" className={inputClass} />
              </Field>
              <InviteSelect
                options={inviteOptions}
                allowFounding
                allowUnset
              />
              <Field label="Notes">
                <textarea name="notes" rows={2} className={inputClass} />
              </Field>
              <Field
                label="Status"
                hint="Active players are auto-added to all upcoming bookings (Booked & For Booking)."
              >
                <select name="active_status" defaultValue="active" className={inputClass}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <SubmitButton className="w-full" pendingLabel="Adding player…">
                Add player
              </SubmitButton>
            </form>
          </Card>
        </div>

        {/* List */}
        <div className="lg:order-1 lg:col-span-2">
          {list.length === 0 ? (
            <EmptyState
              title="No players found"
              description="Add your first player using the form."
            />
          ) : (
            <PlayerListFilter
              placeholder="Search players…"
              statuses={[
                { value: "", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "archived", label: "Archived" },
              ]}
            >
            <div className="max-h-[32rem] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1">
              {list.map((p) => {
                const bal = balMap.get(p.id) ?? 0;
                const d = describeBalance(bal);
                const invited = inviteLineFromIndex(p.id, inviteIndex, identities);
                return (
                  <Link
                    key={p.id}
                    href={`/admin/players/${p.id}`}
                    data-player-name={`${p.name} ${p.display_name ?? ""} ${invited ?? ""}`}
                    data-player-status={p.active_status}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition hover:bg-emerald-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar
                        name={p.name}
                        src={identities.get(p.id)?.avatarUrl}
                        size="sm"
                        verified={links.linked.has(p.id)}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {p.name}
                          {p.display_name ? (
                            <span className="ml-2 text-sm font-normal text-slate-400">
                              {p.display_name}
                            </span>
                          ) : null}
                        </p>
                        {invited ? (
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {invited}
                          </p>
                        ) : null}
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={p.active_status} />
                        {links.linked.has(p.id) ? (
                          <StatusBadge status="linked" />
                        ) : links.pendingClaims.has(p.id) ? (
                          <StatusBadge status="pending" />
                        ) : (
                          <StatusBadge status="unclaimed" />
                        )}
                        {p.hidden_on_board ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Off board
                          </span>
                        ) : null}
                      </div>
                    </div>
                    </div>
                    <div className="text-right">
                      <Badge tone={d.tone}>{d.label}</Badge>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          d.tone === "collect"
                            ? "text-rose-600"
                            : d.tone === "credit"
                              ? "text-emerald-600"
                              : "text-slate-400"
                        }`}
                      >
                        {d.tone === "settled" ? "—" : formatMoney(d.amount)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
            </PlayerListFilter>
          )}
        </div>
      </div>
    </div>
  );
}
