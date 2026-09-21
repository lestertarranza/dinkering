import Link from "next/link";
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
  PlayerNameLine,
  publicTapRowClass,
  publicChevronClass,
  publicHintText,
  publicMainClass,
} from "@/components/public-ui";
import {
  PublicBottomNav,
  RememberPublicTokens,
  SaveAsMyPage,
} from "@/components/PublicBottomNav";
import { PublicSearchList } from "@/components/PublicSearchList";
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
    <>
      <RememberPublicTokens teamToken={token} />
      <main className={publicMainClass}>
        <PublicPageHeader
          icon="🧑"
          title="Players"
          subtitle="Find your name. If it is not verified yet, tap This is me to save it as My page."
        />

        {list.length > 0 ? (
          <p className="mb-4 flex flex-wrap items-center justify-center gap-1.5 text-xs font-medium">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              {`${list.length} player${list.length === 1 ? "" : "s"}`}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
              {verifiedCount} verified
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              {unverifiedCount} not verified
            </span>
          </p>
        ) : null}

        {list.length === 0 ? (
          <EmptyState title="No players yet" />
        ) : (
          <PublicSearchList
            placeholder="Search your name…"
            emptyTitle="No player matches your search"
            minToShowSearch={8}
            items={list.map((p) => {
              const face = playerFace(p.id, p, identities);
              const invited = inviteLineFromIndex(p.id, inviteIndex, identities);
              return {
                key: p.id,
                search: `${face.name} ${invited ?? ""}`,
                node: (
                  <div className={`${publicTapRowClass}`}>
                    <Link
                      href={`/p/${p.public_token}`}
                      className="min-w-0 flex-1"
                    >
                      <PlayerNameLine
                        name={face.name}
                        verified={face.verified}
                        avatarUrl={face.avatarUrl}
                        subtitle={invited ?? "Open page"}
                      />
                    </Link>
                    <SaveAsMyPage
                      playerToken={p.public_token}
                      teamToken={token}
                      goHome
                      compact
                      verified={face.verified}
                      owned={auth.profile?.player_id === p.id}
                    />
                    <Link
                      href={`/p/${p.public_token}`}
                      className={publicChevronClass}
                      aria-hidden
                    >
                      ›
                    </Link>
                  </div>
                ),
              };
            })}
          />
        )}

        <p className={`mt-4 px-1 text-center ${publicHintText}`}>
          This is me is for names that are not verified yet. It saves your page
          on this phone. Verified names already have a login. If that name is
          yours, tap Go to My Profile.
        </p>
        <footer className="mt-6 text-center text-sm text-slate-400">
        Shared player list · please don&apos;t post this page publicly
        </footer>
      </main>
      <PublicBottomNav teamToken={token} />
    </>
  );
}
