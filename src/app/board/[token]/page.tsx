import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import {
  TeamBalanceBoard,
  type BalanceItem,
  type BalanceBucket,
} from "@/components/TeamBalanceBoard";
import { formatMoney, describeBalance } from "@/lib/format";
import { validatePublicTeamToken } from "@/lib/public-links";
import {
  PublicPageHeader,
  PublicNavLink,
  publicTapRowClass,
  publicChevronClass,
  publicPrimaryText,
  publicHintText,
} from "@/components/public-ui";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

function BalanceRow({
  href,
  name,
  subtitle,
  tone,
  amount,
}: {
  href: string;
  name: string;
  subtitle?: string;
  tone: "collect" | "credit" | "settled";
  amount: number;
}) {
  const color =
    tone === "collect"
      ? "text-rose-700"
      : tone === "credit"
        ? "text-emerald-700"
        : "text-slate-400";
  return (
    <Link href={href} className={publicTapRowClass}>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${publicPrimaryText}`}>{name}</p>
        {subtitle ? (
          <p className={`truncate text-xs ${publicHintText}`}>{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-right">
        <p className={`text-base font-bold ${color}`}>
          {tone === "settled" ? "—" : formatMoney(amount)}
        </p>
        <span className={publicChevronClass} aria-hidden>
          ›
        </span>
      </div>
    </Link>
  );
}

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

  type Entry = {
    key: string;
    search: string;
    bucket: BalanceBucket;
    amount: number;
    name: string;
    node: React.ReactNode;
  };
  const entries: Entry[] = [];

  const bucketOf = (tone: "collect" | "credit" | "settled"): BalanceBucket =>
    tone === "collect" ? "owe" : tone === "credit" ? "credit" : "settled";

  // ── Group entries: one row per pooled group, members shown inline ──
  for (const g of (pooledGroups ?? []) as {
    id: string;
    name: string;
    public_token: string;
    hidden_on_board: boolean;
  }[]) {
    if (g.hidden_on_board) continue;
    const memberIds = membersByGroup.get(g.id) ?? [];
    const activeMembers = memberIds
      .map((pid) => playerById.get(pid))
      .filter((p): p is ActivePlayer => p !== undefined);
    // Skip groups with no active members at all (nothing meaningful to show).
    if (activeMembers.length === 0) continue;
    const memberNames = activeMembers
      .filter((p) => !p.hidden_on_board)
      .map((p) => label(p))
      .sort((a, b) => a.localeCompare(b));

    const groupBalance = groupBalMap.get(g.id) ?? 0;
    const d = describeBalance(groupBalance);
    const subtitle =
      memberNames.length > 0 ? memberNames.join(" · ") : "shared wallet";
    entries.push({
      key: `g:${g.id}`,
      search: `${g.name} ${memberNames.join(" ")}`,
      bucket: bucketOf(d.tone),
      amount: d.amount,
      name: g.name,
      node: (
        <BalanceRow
          href={`/g/${g.public_token}`}
          name={g.name}
          subtitle={subtitle}
          tone={d.tone}
          amount={d.amount}
        />
      ),
    });
  }

  // ── Individual entries: active, visible players not in any pooled group ──
  for (const p of activePlayers) {
    if (pooledPlayerIds.has(p.id) || p.hidden_on_board) continue;
    const balance = playerBalMap.get(p.id) ?? 0;
    const d = describeBalance(balance);
    entries.push({
      key: `p:${p.id}`,
      search: label(p),
      bucket: bucketOf(d.tone),
      amount: d.amount,
      name: label(p),
      node: (
        <BalanceRow
          href={`/p/${p.public_token}`}
          name={label(p)}
          tone={d.tone}
          amount={d.amount}
        />
      ),
    });
  }

  // Within each column, biggest balances first; settled alphabetical.
  const bucketRank = (e: Entry) =>
    e.bucket === "owe" ? 0 : e.bucket === "credit" ? 1 : 2;
  entries.sort((a, b) => {
    if (a.bucket !== b.bucket) return bucketRank(a) - bucketRank(b);
    if (a.bucket === "settled") return a.name.localeCompare(b.name);
    return b.amount - a.amount;
  });

  const items: BalanceItem[] = entries.map((e) => ({
    key: e.key,
    search: e.search,
    bucket: e.bucket,
    node: e.node,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 text-[17px] leading-relaxed sm:text-base">
      <PublicPageHeader
        icon="🏓"
        title="Dinkering Pickleball"
        subtitle="Tap your name to open your private page."
      />

      <nav className="mb-5 flex justify-center">
        <PublicNavLink href={`/schedule/${token}`}>Upcoming games</PublicNavLink>
      </nav>

      {items.length === 0 ? (
        <EmptyState title="No players yet" />
      ) : (
        <TeamBalanceBoard items={items} />
      )}

      <p className={`mt-4 px-1 text-center ${publicHintText}`}>
        Grouped players (couples, families, team funds) share one balance — tap a
        group to see its shared ledger and members.
      </p>
      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared team board · please don&apos;t post publicly
      </footer>
    </main>
  );
}
