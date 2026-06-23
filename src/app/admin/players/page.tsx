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
import { ActionForm } from "@/components/ActionForm";
import { CopyLink, ShareLink } from "@/components/CopyLink";
import { formatMoney, describeBalance } from "@/lib/format";
import type { Player } from "@/lib/types";
import { createPlayer, regenerateRosterToken } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("players").select("*").order("name");
  if (status) query = query.eq("active_status", status);
  const { data: players } = await query;

  const { data: balances } = await supabase.from("player_balances").select("*");
  const balMap = new Map(
    (balances ?? []).map((b) => [b.player_id as string, Number(b.balance)]),
  );

  const { data: settings } = await supabase
    .from("app_settings")
    .select("roster_token")
    .single();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const boardUrl = settings?.roster_token
    ? `${appUrl}/board/${settings.roster_token}`
    : null;
  const scheduleUrl = settings?.roster_token
    ? `${appUrl}/schedule/${settings.roster_token}`
    : null;

  const list = ((players ?? []) as Player[]).filter((p) =>
    q ? `${p.name} ${p.display_name ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true,
  );

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
                <ActionForm
                  action={regenerateRosterToken}
                  pendingLabel="Regenerating team links…"
                >
                  <SubmitButton variant="ghost" pendingLabel="Regenerating…">
                    Regenerate token (invalidates both links)
                  </SubmitButton>
                </ActionForm>
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
              <Field label="Notes">
                <textarea name="notes" rows={2} className={inputClass} />
              </Field>
              <SubmitButton className="w-full" pendingLabel="Adding player…">
                Add player
              </SubmitButton>
            </form>
          </Card>
        </div>

        {/* List */}
        <div className="lg:order-1 lg:col-span-2">
          <form className="mb-3 flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search players…"
              className={`${inputClass} max-w-xs`}
            />
            <select name="status" defaultValue={status} className={`${inputClass} max-w-[10rem]`}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
            <SubmitButton variant="secondary">Filter</SubmitButton>
          </form>

          {list.length === 0 ? (
            <EmptyState
              title="No players found"
              description="Add your first player using the form."
            />
          ) : (
            <div className="space-y-2">
              {list.map((p) => {
                const bal = balMap.get(p.id) ?? 0;
                const d = describeBalance(bal);
                return (
                  <Link
                    key={p.id}
                    href={`/admin/players/${p.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {p.name}
                        {p.display_name ? (
                          <span className="ml-2 text-sm font-normal text-slate-400">
                            {p.display_name}
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={p.active_status} />
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
          )}
        </div>
      </div>
    </div>
  );
}
