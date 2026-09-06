import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import {
  TeamBalanceBoard,
  type BalanceItem,
  type BalanceBucket,
} from "@/components/TeamBalanceBoard";
import { formatMoney, describeBalance, formatDate } from "@/lib/format";
import { validatePublicTeamToken } from "@/lib/public-links";
import { fundBalanceFromEntries } from "@/lib/club-funds";
import {
  PublicPageHeader,
  publicTapRowClass,
  publicChevronClass,
  publicPrimaryText,
  publicHintText,
} from "@/components/public-ui";
import {
  PublicBottomNav,
  RememberPublicTokens,
} from "@/components/PublicBottomNav";
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

  const [{ data: clubFunds }, { data: clubFundBalances }, { data: clubPurchases }] =
    await Promise.all([
    db
      .from("club_item_funds")
      .select("id, name, status")
      .eq("status", "active")
      .order("name"),
    db
      .from("club_fund_entries")
      .select("fund_id, kind, amount, voided"),
    db
      .from("club_fund_entries")
      .select(
        "id, fund_id, amount, description, entry_date, players:paid_by_player_id(name)",
      )
      .eq("kind", "spend")
      .eq("voided", false)
      .order("entry_date", { ascending: false })
      .limit(20),
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

  const totals = {
    owed: entries
      .filter((e) => e.bucket === "owe")
      .reduce((s, e) => s + e.amount, 0),
    credit: entries
      .filter((e) => e.bucket === "credit")
      .reduce((s, e) => s + e.amount, 0),
  };

  type FundEntryRow = {
    fund_id: string;
    kind: string;
    amount: number;
    voided: boolean;
  };
  const entriesByFund = new Map<string, FundEntryRow[]>();
  for (const e of (clubFundBalances ?? []) as FundEntryRow[]) {
    const list = entriesByFund.get(e.fund_id) ?? [];
    list.push(e);
    entriesByFund.set(e.fund_id, list);
  }
  type PurchaseRow = {
    id: string;
    fund_id: string;
    amount: number;
    description: string | null;
    entry_date: string;
    players: { name: string } | null;
  };
  const purchasesByFund = new Map<string, PurchaseRow[]>();
  for (const p of (clubPurchases ?? []) as unknown as PurchaseRow[]) {
    const list = purchasesByFund.get(p.fund_id) ?? [];
    if (list.length < 4) list.push(p);
    purchasesByFund.set(p.fund_id, list);
  }
  const clubFundRows = (
    (clubFunds ?? []) as { id: string; name: string; status: string }[]
  ).map((f) => ({
    id: f.id,
    name: f.name,
    balance: fundBalanceFromEntries(entriesByFund.get(f.id) ?? []),
    purchases: (purchasesByFund.get(f.id) ?? []).map((p) => ({
      id: p.id,
      description: p.description,
      entry_date: p.entry_date,
      amount: Number(p.amount),
      buyer: p.players?.name ?? null,
    })),
  }));

  return (
    <>
    <RememberPublicTokens teamToken={token} />
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24 text-[17px] leading-relaxed sm:text-base">
      <PublicPageHeader
        icon="🏓"
        title="Dinkering Pickleball"
        subtitle="Tap your name to open your private page."
      />

      {items.length === 0 ? (
        <EmptyState title="No players on the board yet" description="Active players will show up here once they're added." />
      ) : (
        <TeamBalanceBoard items={items} totals={totals} />
      )}

      {clubFundRows.length > 0 ? (
        <section className="mt-8">
          <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${publicHintText}`}>
            Club items
          </h2>
          <p className={`mb-3 text-sm ${publicHintText}`}>
            Money the group has set aside for consumables. Purchases show who bought them.
          </p>
          <ul className="space-y-3">
            {clubFundRows.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={`font-semibold ${publicPrimaryText}`}>{f.name}</p>
                  <p
                    className={`shrink-0 font-bold ${
                      f.balance < 0 ? "text-rose-700" : "text-emerald-700"
                    }`}
                  >
                    {f.balance < 0
                      ? `${formatMoney(-f.balance)} still to collect`
                      : formatMoney(f.balance)}
                  </p>
                </div>
                {f.purchases.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {f.purchases.map((p) => (
                      <li key={p.id}>
                        {p.description ?? "Purchase"} · {formatDate(p.entry_date)}
                        {p.buyer ? ` · bought by ${p.buyer}` : ""} ·{" "}
                        {formatMoney(p.amount)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`mt-2 text-sm ${publicHintText}`}>
                    No purchases recorded yet.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={`mt-4 px-1 text-center ${publicHintText}`}>
        Grouped players (couples, families, team funds) share one balance — tap a
        group to see its shared ledger and members.
      </p>
      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared team board · please don&apos;t post publicly
      </footer>
    </main>
    <PublicBottomNav teamToken={token} />
    </>
  );
}
