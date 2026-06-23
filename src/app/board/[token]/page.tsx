import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatMoney, describeBalance, SETTLE_TOLERANCE } from "@/lib/format";
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

type PooledInfo = { groupId: string; name: string };

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
    { data: memberships },
  ] = await Promise.all([
    db
      .from("players")
      .select("id, name, display_name, public_token")
      .eq("active_status", "active")
      .order("name"),
    db.from("player_balances").select("player_id, balance"),
    db.from("group_balances").select("player_group_id, balance"),
    db
      .from("player_group_members")
      .select("player_id, player_group_id, player_groups!inner(name, type)")
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
  const pooledMap = new Map<string, PooledInfo>();
  for (const m of (memberships ?? []) as unknown as {
    player_id: string;
    player_group_id: string;
    player_groups: { name: string } | null;
  }[]) {
    if (!pooledMap.has(m.player_id)) {
      pooledMap.set(m.player_id, {
        groupId: m.player_group_id,
        name: m.player_groups?.name ?? "group",
      });
    }
  }

  const rows = ((players ?? []) as Pick<
    Player,
    "id" | "name" | "display_name" | "public_token"
  >[])
    .map((p) => {
      const pooled = pooledMap.get(p.id);
      const individualBalance = playerBalMap.get(p.id) ?? 0;
      const groupBalance = pooled
        ? groupBalMap.get(pooled.groupId) ?? 0
        : 0;
      // Combined used for sorting — neither wallet is silently dropped.
      const combinedBalance = individualBalance + groupBalance;
      return {
        id: p.id,
        label: p.display_name?.trim() || p.name,
        token: p.public_token,
        individualBalance,
        groupBalance,
        combinedBalance,
        pooled,
      };
    })
    .sort((a, b) => {
      const rank = (bal: number) =>
        Math.abs(bal) < SETTLE_TOLERANCE ? 2 : bal < 0 ? 0 : 1;
      const ra = rank(a.combinedBalance);
      const rb = rank(b.combinedBalance);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return a.combinedBalance - b.combinedBalance;
      if (ra === 1) return b.combinedBalance - a.combinedBalance;
      return a.label.localeCompare(b.label);
    });

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

      {rows.length === 0 ? (
        <EmptyState title="No players yet" />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => {
            // Primary: individual player wallet balance
            const dInd = describeBalance(r.individualBalance);
            // Secondary: group wallet (only show when non-trivial)
            const dGrp = r.pooled
              ? describeBalance(r.groupBalance)
              : null;
            const showGrp =
              dGrp !== null && dGrp.tone !== "settled";
            return (
              <Link
                key={r.id}
                href={`/p/${r.token}`}
                className={publicTapRowClass}
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-base ${publicPrimaryText}`}>
                    {r.label}
                  </p>
                  {showGrp ? (
                    <p className={`truncate ${publicHintText}`}>
                      {r.pooled!.name}:{" "}
                      <span
                        className={
                          dGrp!.tone === "collect"
                            ? "font-semibold text-rose-600"
                            : "font-semibold text-emerald-600"
                        }
                      >
                        {dGrp!.tone === "collect" ? "owes " : "credit "}
                        {formatMoney(dGrp!.amount)}
                      </span>
                    </p>
                  ) : r.pooled ? (
                    <p className={`truncate ${publicHintText}`}>
                      Shared with {r.pooled.name}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                    <Badge tone={dInd.tone} size="md">
                      {dInd.label}
                    </Badge>
                    <p
                      className={`mt-1 text-base font-bold ${
                        dInd.tone === "collect"
                          ? "text-rose-700"
                          : dInd.tone === "credit"
                            ? "text-emerald-700"
                            : "text-slate-500"
                      }`}
                    >
                      {dInd.tone === "settled"
                        ? "—"
                        : formatMoney(dInd.amount)}
                    </p>
                  </div>
                  <span className={publicChevronClass} aria-hidden>
                    ›
                  </span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}

      <p className={`mt-4 px-1 text-center ${publicHintText}`}>
        Badge shows your personal balance. If you share a group wallet, the
        group&apos;s balance appears below your name when non-zero.
      </p>
      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared team board · please don&apos;t post publicly
      </footer>
    </main>
  );
}
