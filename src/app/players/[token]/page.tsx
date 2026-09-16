import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { validatePublicTeamToken } from "@/lib/public-links";
import { loadLinkedIdentities } from "@/lib/accounts";
import { playerFace } from "@/lib/player-identity";
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

  const [{ data: players }, identities] = await Promise.all([
    db
      .from("players")
      .select("id, name, display_name, public_token, active_status")
      .eq("active_status", "active")
      .order("name"),
    loadLinkedIdentities(),
  ]);

  const list = (players ?? []) as Pick<
    Player,
    "id" | "name" | "display_name" | "public_token"
  >[];

  return (
    <>
      <RememberPublicTokens teamToken={token} />
      <main className={publicMainClass}>
        <PublicPageHeader
          icon="🧑"
          title="Players"
          subtitle="Find your name, tap This is me, and that becomes My page on the bottom bar."
        />

        {list.length === 0 ? (
          <EmptyState title="No players yet" />
        ) : (
          <PublicSearchList
            placeholder="Search your name…"
            emptyTitle="No player matches your search"
            minToShowSearch={8}
            items={list.map((p) => {
              const face = playerFace(p.id, p, identities);
              return {
                key: p.id,
                search: face.name,
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
                        subtitle="Open page"
                      />
                    </Link>
                    <SaveAsMyPage
                      playerToken={p.public_token}
                      teamToken={token}
                      goHome
                      compact
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
          This is me saves your page on this phone. It does not change anyone
          else&apos;s.
        </p>
        <footer className="mt-6 text-center text-sm text-slate-400">
        Shared player list · please don&apos;t post this page publicly
        </footer>
      </main>
      <PublicBottomNav teamToken={token} />
    </>
  );
}
