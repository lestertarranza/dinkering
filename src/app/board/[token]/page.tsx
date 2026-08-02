import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge, EmptyState } from "@/components/ui";
import { PublicSearchList } from "@/components/PublicSearchList";
import { formatMoney, describeBalance, SETTLE_TOLERANCE } from "@/lib/format";
import { round2 } from "@/lib/ledger";
import { validatePublicTeamToken } from "@/lib/public-links";
import {
  PublicPageHeader,
  PublicNavLink,
  publicMainClass,
  publicTapRowClass,
  publicChevronClass,
  publicPrimaryText,
  publicHintText,
} from "@/components/public-ui";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  label: string;
  token: string;
  personalBalance: number;
};

type Entry =
  | {
      kind: "group";
      key: string;
      search: string;
      sortBalance: number;
      name: string;
      token: string;
      groupBalance: number;
      members: MemberRow[];
    }
  | {
      kind: "player";
      key: string;
      search: string;
      sortBalance: number;
      label: string;
      token: string;
      personalBalance: number;
    };

export default async function TeamBoard({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();

  if (!(await validatePublicTeamToken(db, token))) notFound();

  const [
    { data: players },
    { data: playerBalances },
    { data: groupBalances },
    { data: pooledGroups },
    { data: memberships },
  ] = await Promise.all([
    db
      .from("players")
      .select("id, name, display_name, public_token, hidden_on_board")
      .eq("active_status", "active")
      .order("name"),
    db.from("player_balances").select("player_id, balance"),
    db.from("group_balances").select("player_group_id, balance"),
    db
      .from("player_groups")
      .select("id, name, public_token, hidden_on_board")
      .in("type", ["couple", "family", "team_fund"]),
    db
      .from("player_group_members")
      .select("player_id, player_group_id, player_groups!inner(type)")
      .in("player_groups.type", ["couple", "family", "team_fund"])
      .is("end_date", null),
  ]);

  const playerBalMap = new Map(
    ((playerBalances ?? []) as { player_id: string; balance: number }[]).map(
      (b) => [b.player_id, Number(b.balance)],
    ),
  );
  const groupBalMap = new Map(
    ((groupBalances ?? []) as { player_group_id: string; balance: number }[]).map(
      (b) => [b.player_group_id, Number(b.balance)],
    ),
  );

  type ActivePlayer = Pick<
    Player,
    "id" | "name" | "display_name" | "public_token" | "hidden_on_board"
  >;
  const activePlayers = (players ?? []) as ActivePlayer[];
  const playerById = new Map(activePlayers.map((p) => [p.id, p]));
  const label = (p: ActivePlayer) => p.display_name?.trim() || p.name;

  // Group members by their pooled group; track everyone in a pooled group so we
  // never also list them as a standalone entry.
  const membersByGroup = new Map<string, string[]>();
  const pooledPlayerIds = new Set<string>();
  for (const m of (memberships ?? []) as {
    player_id: string;
    player_group_id: string;
  }[]) {
    pooledPlayerIds.add(m.player_id);
    const list = membersByGroup.get(m.player_group_id) ?? [];
    list.push(m.player_id);
    membersByGroup.set(m.player_group_id, list);
  }

  const entries: Entry[] = [];

  // ── Group entries: one row per pooled group, members listed beneath ──
  for (const g of (pooledGroups ?? []) as {
    id: string;
    name: string;
    public_token: string;
    hidden_on_board: boolean;
  }[]) {
    if (g.hidden_on_board) continue;
    const memberIds = membersByGroup.get(g.id) ?? [];
    // playerById only holds active players, so inactive members drop out here.
    const activeMembers = memberIds
      .map((pid) => playerById.get(pid))
      .filter((p): p is ActivePlayer => Boolean(p));
    if (activeMembers.length === 0) continue;

    const members: MemberRow[] = activeMembers
      .filter((p) => !p.hidden_on_board)
      .map((p) => ({
        id: p.id,
        label: label(p),
        token: p.public_token,
        personalBalance: playerBalMap.get(p.id) ?? 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const groupBalance = groupBalMap.get(g.id) ?? 0;
    const personalSum = members.reduce((s, m) => s + m.personalBalance, 0);
    entries.push({
      kind: "group",
      key: `g:${g.id}`,
      search: `${g.name} ${members.map((m) => m.label).join(" ")}`,
      sortBalance: round2(groupBalance + personalSum),
      name: g.name,
      token: g.public_token,
      groupBalance,
      members,
    });
  }

  // ── Individual entries: active, visible players not in any pooled group ──
  for (const p of activePlayers) {
    if (pooledPlayerIds.has(p.id) || p.hidden_on_board) continue;
    const personalBalance = playerBalMap.get(p.id) ?? 0;
    entries.push({
      kind: "player",
      key: `p:${p.id}`,
      search: label(p),
      sortBalance: personalBalance,
      label: label(p),
      token: p.public_token,
      personalBalance,
    });
  }

  // Sort: owed-to-team first (most owed), then credit, then settled; by name.
  entries.sort((a, b) => {
    const rank = (bal: number) =>
      Math.abs(bal) < SETTLE_TOLERANCE ? 2 : bal < 0 ? 0 : 1;
    const ra = rank(a.sortBalance);
    const rb = rank(b.sortBalance);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.sortBalance - b.sortBalance;
    if (ra === 1) return b.sortBalance - a.sortBalance;
    const an = a.kind === "group" ? a.name : a.label;
    const bn = b.kind === "group" ? b.name : b.label;
    return an.localeCompare(bn);
  });

  const balanceValue = (d: ReturnType<typeof describeBalance>) =>
    d.tone === "settled" ? "—" : formatMoney(d.amount);

  return (
    <main className={publicMainClass}>
      <PublicPageHeader
        icon="🏓"
        title="Dinkering Pickleball"
        subtitle="Tap your name to open your private page."
      />

      <nav className="mb-5 flex justify-center">
        <PublicNavLink href={`/schedule/${token}`}>Upcoming games</PublicNavLink>
      </nav>

      {entries.length === 0 ? (
        <EmptyState title="No players yet" />
      ) : (
        <PublicSearchList
          placeholder="Search your name…"
          emptyTitle="No player matches your search"
          items={entries.map((e) => {
            if (e.kind === "group") {
              const dGroup = describeBalance(e.groupBalance);
              return {
                key: e.key,
                search: e.search,
                node: (
                  <div>
                    <Link href={`/g/${e.token}`} className={publicTapRowClass}>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-base ${publicPrimaryText}`}>
                          {e.name}
                        </p>
                        <p className={`truncate ${publicHintText}`}>
                          {e.members.length > 0
                            ? `${e.members.length} member${e.members.length === 1 ? "" : "s"} · shared wallet`
                            : "shared wallet"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <div>
                          <Badge tone={dGroup.tone} size="md">
                            {dGroup.label}
                          </Badge>
                          <p
                            className={`mt-1 text-base font-bold ${
                              dGroup.tone === "collect"
                                ? "text-rose-700"
                                : dGroup.tone === "credit"
                                  ? "text-emerald-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {balanceValue(dGroup)}
                          </p>
                        </div>
                        <span className={publicChevronClass} aria-hidden>
                          ›
                        </span>
                      </div>
                    </Link>

                    {e.members.length > 0 ? (
                      <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60">
                        {e.members.map((m) => {
                          const dp = describeBalance(m.personalBalance);
                          return (
                            <Link
                              key={m.id}
                              href={`/p/${m.token}`}
                              className="flex touch-manipulation items-center gap-3 py-2.5 pl-9 pr-4 transition-all duration-150 hover:bg-white active:scale-[0.98] active:bg-emerald-100"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                                {m.label}
                              </span>
                              {dp.tone === "settled" ? (
                                <span className="text-xs text-slate-400">
                                  settled
                                </span>
                              ) : (
                                <span
                                  className={`text-xs font-medium ${
                                    dp.tone === "collect"
                                      ? "text-rose-600"
                                      : "text-emerald-600"
                                  }`}
                                >
                                  {dp.tone === "collect"
                                    ? "personal "
                                    : "personal credit "}
                                  {formatMoney(dp.amount)}
                                </span>
                              )}
                              <span
                                className="shrink-0 text-sm font-semibold text-emerald-600"
                                aria-hidden
                              >
                                ›
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ),
              };
            }

            const dPersonal = describeBalance(e.personalBalance);
            return {
              key: e.key,
              search: e.search,
              node: (
                <Link href={`/p/${e.token}`} className={publicTapRowClass}>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-base ${publicPrimaryText}`}>
                      {e.label}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-right">
                    <div>
                      <Badge tone={dPersonal.tone} size="md">
                        {dPersonal.label}
                      </Badge>
                      <p
                        className={`mt-1 text-base font-bold ${
                          dPersonal.tone === "collect"
                            ? "text-rose-700"
                            : dPersonal.tone === "credit"
                              ? "text-emerald-700"
                              : "text-slate-500"
                        }`}
                      >
                        {balanceValue(dPersonal)}
                      </p>
                    </div>
                    <span className={publicChevronClass} aria-hidden>
                      ›
                    </span>
                  </div>
                </Link>
              ),
            };
          })}
        />
      )}

      <p className={`mt-4 px-1 text-center ${publicHintText}`}>
        Grouped players (couples, families, team funds) show one shared balance —
        tap the group to see the shared ledger, or tap a member for their own
        page.
      </p>
      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared team board · please don&apos;t post publicly
      </footer>
    </main>
  );
}
