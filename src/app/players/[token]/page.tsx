import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { validatePublicTeamToken, publicPlayerLabel } from "@/lib/public-links";
import {
  PublicPageHeader,
  publicTapRowClass,
  publicChevronClass,
  publicPrimaryText,
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

  const { data: players } = await db
    .from("players")
    .select("id, name, display_name, public_token, active_status")
    .eq("active_status", "active")
    .order("name");

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
              const label = publicPlayerLabel(p);
              return {
                key: p.id,
                search: label,
                node: (
                  <div className={`${publicTapRowClass}`}>
                    <Link
                      href={`/p/${p.public_token}`}
                      className="min-w-0 flex-1"
                    >
                      <p className={`truncate text-[15px] ${publicPrimaryText}`}>
                        {label}
                      </p>
                      <p className={`truncate text-xs ${publicHintText}`}>
                        Open page
                      </p>
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
