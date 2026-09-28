import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { validatePublicTeamToken } from "@/lib/public-links";
import { loadLinkedIdentities, loadInviteIndex } from "@/lib/accounts";
import { getAuthContext } from "@/lib/auth";
import { playerFace } from "@/lib/player-identity";
import { inviteLineFromIndex } from "@/lib/player-invite";
import {
  PublicPageHeader,
  publicHintText,
  publicMainClass,
} from "@/components/public-ui";
import {
  RememberPublicTokens,
} from "@/components/PublicBottomNav";
import { PublicChrome } from "@/components/PlayerSessionBar";
import { PlayerDirectory } from "@/components/PlayerDirectory";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PublicPlayersPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();
  if (!(await validatePublicTeamToken(db, token))) notFound();

  const [{ data: players }, identities, inviteIndex, auth] = await Promise.all([
    db
      .from("players")
      .select("id, name, display_name, public_token, active_status")
      .eq("active_status", "active")
      .order("name"),
    loadLinkedIdentities(),
    loadInviteIndex(db),
    getAuthContext(),
  ]);

  const list = (players ?? []) as Pick<
    Player,
    "id" | "name" | "display_name" | "public_token"
  >[];
  const verifiedCount = list.filter((p) => identities.has(p.id)).length;
  const unverifiedCount = list.length - verifiedCount;

  return (
    <PublicChrome returnTo={`/players/${token}`} teamToken={token}>
      <RememberPublicTokens teamToken={token} />
      <main className={publicMainClass}>
        <PublicPageHeader
          icon="🧑"
          title="Players"
          subtitle="Find your name. Sign in if you already have a login. Otherwise tap This is me."
        />

        {list.length > 0 ? (
          <p className="mb-4 flex flex-wrap items-center justify-center gap-1.5 text-xs font-medium">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              {`${list.length} player${list.length === 1 ? "" : "s"}`}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
              {verifiedCount} with a login
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              {unverifiedCount} no login yet
            </span>
          </p>
        ) : null}

        {list.length === 0 ? (
          <EmptyState title="No players yet" />
        ) : (
          <PlayerDirectory
            teamToken={token}
            rows={list
              .map((p) => {
                const face = playerFace(p.id, p, identities);
                const invited = inviteLineFromIndex(p.id, inviteIndex, identities);
                return {
                  id: p.id,
                  name: face.name,
                  subtitle: invited ?? "Open page",
                  href: `/p/${p.public_token}`,
                  playerToken: p.public_token,
                  verified: face.verified,
                  owned: auth.profile?.player_id === p.id,
                  avatarUrl: face.avatarUrl,
                };
              })
              .sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name))}
          />
        )}

        <p className={`mt-4 px-1 text-center ${publicHintText}`}>
          This is me saves a name that has no login yet, on this phone. If you
          have a login, sign in and use My page.
        </p>
        <footer className="mt-6 text-center text-sm text-slate-400">
        Shared player list · please don&apos;t post this page publicly
        </footer>
      </main>
    </PublicChrome>
  );
}
