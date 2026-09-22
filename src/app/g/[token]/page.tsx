import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui";
import { formatMoney, describeBalance } from "@/lib/format";
import {
  buildLedgerBookingContext,
  formatBookingContext,
} from "@/lib/booking-context";
import {
  PublicSection,
  publicMainClass,
  publicPrimaryText,
  publicHintText,
  PlayerChip,
} from "@/components/public-ui";
import { PendingLink } from "@/components/PendingLink";
import { PlayerActivityList } from "@/components/PlayerActivityList";
import { activityTitle } from "@/lib/player-ledger-copy";
import { loadLinkedIdentities } from "@/lib/accounts";
import { playerFace } from "@/lib/player-identity";
import { fetchAllRows } from "@/lib/paginate";
import {
  PublicBottomNav,
  RememberPublicTokens,
} from "@/components/PublicBottomNav";
import type { LedgerEntry, PlayerGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

const LEDGER_PAGE_SIZE = 10;
const LEDGER_COLS =
  "id, entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount, voided, player_id, player_group_id";

export default async function GroupPortal({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lpage?: string }>;
}) {
  const [{ token }, { lpage: lpageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const lpage = Math.max(1, parseInt(lpageParam ?? "1", 10) || 1);
  const db = createAdminClient();

  const { data: group } = await db
    .from("player_groups")
    .select("*")
    .eq("public_token", token)
    .single();
  if (!group) notFound();
  const g = group as PlayerGroup;

  const [
    { data: bal },
    ledgerRows,
    { data: members },
    { data: settings },
    identities,
  ] = await Promise.all([
    db.from("group_balances").select("*").eq("player_group_id", g.id).single(),
    fetchAllRows<LedgerEntry>((from, to) =>
      db
        .from("ledger_entries")
        .select(LEDGER_COLS)
        .eq("player_group_id", g.id)
        .eq("voided", false)
        .order("entry_date")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    db
      .from("player_group_members")
      .select("is_primary, players(id, name, display_name, public_token)")
      .eq("player_group_id", g.id)
      .is("end_date", null),
    db.from("app_settings").select("roster_token, roster_public").single(),
    loadLinkedIdentities(),
  ]);

  const balance = Number(bal?.balance ?? 0);
  const d = describeBalance(balance);

  const ordered = [...ledgerRows].sort((a, b) => {
    const byDate = a.entry_date.localeCompare(b.entry_date);
    return byDate !== 0 ? byDate : a.created_at.localeCompare(b.created_at);
  });
  let runningBalance = 0;
  const fullStatement: { entry: LedgerEntry; running: number }[] = [];
  for (const e of ordered) {
    runningBalance += Number(e.debit_amount) - Number(e.credit_amount);
    fullStatement.push({ entry: e, running: runningBalance });
  }
  fullStatement.reverse();

  const totalLedger = fullStatement.length;
  const totalLedgerPages = Math.max(1, Math.ceil(totalLedger / LEDGER_PAGE_SIZE));
  const ledgerFrom = (lpage - 1) * LEDGER_PAGE_SIZE;
  const statement = fullStatement.slice(ledgerFrom, ledgerFrom + LEDGER_PAGE_SIZE);
  const statementEntries = statement.map((s) => s.entry);

  const bookingShareIds = statementEntries
    .filter((e) => e.source_type === "booking_share" && e.source_id)
    .map((e) => e.source_id as string);
  const expenseShareIds = statementEntries
    .filter((e) => e.source_type === "team_expense_share" && e.source_id)
    .map((e) => e.source_id as string);
  const fundShareIds = statementEntries
    .filter((e) => e.source_type === "club_fund_share" && e.source_id)
    .map((e) => e.source_id as string);

  const [ledgerContext, { data: bookingOwners }, { data: expenseOwners }, { data: fundOwners }] =
    await Promise.all([
      buildLedgerBookingContext(db, statementEntries),
      bookingShareIds.length > 0
        ? db
            .from("booking_shares")
            .select("id, players(name)")
            .in("id", bookingShareIds)
        : Promise.resolve({ data: [] as { id: string; players: { name: string } | null }[] }),
      expenseShareIds.length > 0
        ? db
            .from("team_expense_shares")
            .select(
              "id, players(name), team_expenses(description)",
            )
            .in("id", expenseShareIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              players: { name: string } | null;
              team_expenses: { description: string } | null;
            }[],
          }),
      fundShareIds.length > 0
        ? db
            .from("club_fund_shares")
            .select("id, players(name)")
            .in("id", fundShareIds)
        : Promise.resolve({ data: [] as { id: string; players: { name: string } | null }[] }),
    ]);

  const ownerByShare = new Map<string, string>();
  const expenseDescByShare = new Map<string, string>();
  for (const s of (bookingOwners ?? []) as {
    id: string;
    players: { name: string } | null;
  }[]) {
    if (s.players?.name) ownerByShare.set(s.id, s.players.name);
  }
  for (const s of (expenseOwners ?? []) as {
    id: string;
    players: { name: string } | null;
    team_expenses: { description: string } | null;
  }[]) {
    if (s.players?.name) ownerByShare.set(s.id, s.players.name);
    if (s.team_expenses?.description)
      expenseDescByShare.set(s.id, s.team_expenses.description);
  }
  for (const s of (fundOwners ?? []) as {
    id: string;
    players: { name: string } | null;
  }[]) {
    if (s.players?.name) ownerByShare.set(s.id, s.players.name);
  }

  const teamToken =
    settings?.roster_public && settings.roster_token
      ? String(settings.roster_token)
      : null;

  const memberRows = (
    members as unknown as {
      is_primary: boolean;
      players: {
        id: string;
        name: string;
        display_name: string | null;
        public_token: string;
      } | null;
    }[]
  ).filter((m) => m.players);

  return (
    <>
    {teamToken ? <RememberPublicTokens teamToken={teamToken} /> : null}
    <main className={publicMainClass}>
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
          👥
        </div>
        <h1 className={`text-2xl ${publicPrimaryText}`}>{g.name}</h1>
        <p className="mt-0.5 text-base text-slate-600">Shared pickleball wallet</p>
      </header>

      <Card
        className={`mb-5 p-6 text-center ${
          d.tone === "collect"
            ? "border-rose-200 bg-rose-50"
            : d.tone === "credit"
              ? "border-emerald-200 bg-emerald-50"
              : "bg-white"
        }`}
      >
        {d.tone === "collect" ? (
          <>
            <p className="text-base font-medium text-rose-800">This group owes</p>
            <p className="mt-1 text-4xl font-bold text-rose-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : d.tone === "credit" ? (
          <>
            <p className="text-base font-medium text-emerald-800">Group credit</p>
            <p className="mt-1 text-4xl font-bold text-emerald-700">
              {formatMoney(d.amount)}
            </p>
          </>
        ) : (
          <p className="text-3xl font-bold text-slate-800">Settled 🎉</p>
        )}
      </Card>

      <PublicSection title="Members">
        <Card className="overflow-visible p-4">
          <div className="flex flex-wrap gap-2">
            {memberRows.length === 0 ? (
              <span className="text-sm text-slate-400">No members</span>
            ) : (
              memberRows.map((m) => {
                const player = m.players!;
                const face = playerFace(player.id, player, identities);
                return (
                  <PendingLink
                    key={player.id}
                    href={`/p/${player.public_token}`}
                    busyLabel="Opening player page…"
                    className="inline-flex rounded-full"
                    aria-label={`Open ${face.name}'s page`}
                  >
                    <PlayerChip
                      name={face.name}
                      src={face.avatarUrl}
                      verified={face.verified}
                      size="sm"
                      hint={m.is_primary ? "primary" : undefined}
                      nested
                    />
                  </PendingLink>
                );
              })
            )}
          </div>
        </Card>
      </PublicSection>

      <PublicSection title="Wallet activity">
        <p className={`mb-3 px-1 ${publicHintText}`}>
          Charges and payments on this shared wallet, newest first. A name
          means that member&apos;s share.
        </p>
        <PlayerActivityList
          rows={statement.map(({ entry, running }) => {
            const who = entry.source_id
              ? ownerByShare.get(entry.source_id)
              : undefined;
            const bookingCtx = formatBookingContext(ledgerContext.get(entry.id));
            const detail = [who, bookingCtx].filter(Boolean).join(" · ");
            return {
              id: entry.id,
              title: activityTitle(entry, {
                expenseDesc: entry.source_id
                  ? expenseDescByShare.get(entry.source_id)
                  : undefined,
              }),
              detail: detail || undefined,
              date: entry.entry_date,
              signedAmount:
                Number(entry.debit_amount) - Number(entry.credit_amount),
              running,
            };
          })}
          page={lpage}
          pageSize={LEDGER_PAGE_SIZE}
          totalPages={totalLedgerPages}
          total={totalLedger}
          pageHref={(n) => `/g/${token}${n > 1 ? `?lpage=${n}` : ""}`}
          emptyTitle="No charges or payments yet"
          emptyDescription="When this group is billed or pays, it will show up here."
        />
      </PublicSection>

      <footer className="mt-8 text-center text-sm text-slate-400">
        Private link · do not share publicly
      </footer>
    </main>
    <PublicBottomNav teamToken={teamToken} />
    </>
  );
}
