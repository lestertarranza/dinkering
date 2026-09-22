import { PendingLink } from "@/components/PendingLink";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState } from "@/components/ui";
import {
  formatMoney,
  formatDate,
  describeBalance,
} from "@/lib/format";
import { formatBookingContext, buildLedgerBookingContext } from "@/lib/booking-context";
import {
  mergeCourts,
  overallCourtTimeRange,
  formatCourtTime,
} from "@/lib/court-format";
import { isRsvpLocked, getRsvpLockAt } from "@/lib/rsvp-lock";
import { openChargesFromLedger, type LedgerRow } from "@/lib/payment-allocation";
import { HowToPay, BalancePlainSummary } from "@/components/HowToPay";
import { UpcomingGamesFilter } from "@/components/UpcomingGamesFilter";
import { PlayerActivityList } from "@/components/PlayerActivityList";
import { activityTitle } from "@/lib/player-ledger-copy";
import {
  PublicSection,
  DateChip,
  publicMainClass,
  publicPrimaryText,
  publicMetaText,
  publicHintText,
  PlayerAvatar,
} from "@/components/public-ui";
import { PaymentProofForm } from "@/components/PaymentProofForm";
import { AppearanceToggle } from "@/components/AppearanceToggle";
import {
  fetchGoingAndWaitlist,
  waitlistPosition,
} from "@/lib/public-roster";
import { fetchActivity } from "@/lib/activity-log";
import type {
  Booking,
  LedgerEntry,
  Player,
  ResponseStatus,
  ActualStatus,
} from "@/lib/types";
import { RsvpForm } from "./RsvpForm";
import { ScrollToHash } from "@/components/ScrollToHash";
import {
  PublicBottomNav,
  RememberPublicTokens,
  SaveAsMyPage,
} from "@/components/PublicBottomNav";
import { fetchAllRows } from "@/lib/paginate";
import { getAuthContext } from "@/lib/auth";
import { getPlayerLink, loadLinkedIdentities, loadInviteIndex } from "@/lib/accounts";
import { playerFace } from "@/lib/player-identity";
import { inviteLineFromIndex } from "@/lib/player-invite";

export const dynamic = "force-dynamic";

const LEDGER_PAGE_SIZE = 10;
const LEDGER_COLS =
  "id, entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount, voided, player_id, player_group_id";

export default async function PlayerPortal({
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

  const { data: player } = await db
    .from("players")
    .select("*")
    .eq("public_token", token)
    .single();
  if (!player) notFound();
  const p = player as Player;
  const today = new Date().toISOString().slice(0, 10);

  const { data: memberships } = await db
    .from("player_group_members")
    .select("player_group_id, end_date, player_groups!inner(id, name, type, public_token)")
    .eq("player_id", p.id)
    .in("player_groups.type", ["couple", "family", "team_fund"])
    .is("end_date", null);

  const pooled = (memberships ?? [])[0] as unknown as
    | {
        player_group_id: string;
        player_groups: { id: string; name: string; public_token: string };
      }
    | undefined;

  let balance = 0;
  let groupWalletBalance: number | null = null; // null = player not in a pooled group
  let personalWalletBalance = 0;
  let ledger: LedgerEntry[] = [];
  let groupLedgerRows: LedgerEntry[] = [];
  let personalLedgerRows: LedgerEntry[] = [];

  const loadWalletLedger = (column: "player_id" | "player_group_id", id: string) =>
    fetchAllRows<LedgerEntry>((from, to) =>
      db
        .from("ledger_entries")
        .select(LEDGER_COLS)
        .eq(column, id)
        .eq("voided", false)
        .order("entry_date")
        .order("created_at")
        .order("id")
        .range(from, to),
    );

  if (pooled) {
    const [
      { data: gb },
      { data: pb },
      gl,
      pl,
      { data: myBookingShares },
      { data: myExpenseShares },
      { data: myPayments },
      { data: myExpensesBought },
      { data: myManualAdj },
      { data: myFundShares },
      { data: myFundPurchases },
    ] = await Promise.all([
      db
        .from("group_balances")
        .select("balance")
        .eq("player_group_id", pooled.player_group_id)
        .single(),
      db
        .from("player_balances")
        .select("balance")
        .eq("player_id", p.id)
        .single(),
      loadWalletLedger("player_group_id", pooled.player_group_id),
      loadWalletLedger("player_id", p.id),
      db.from("booking_shares").select("id").eq("player_id", p.id),
      db.from("team_expense_shares").select("id").eq("player_id", p.id),
      db.from("payments").select("id").eq("payer_player_id", p.id),
      db.from("team_expenses").select("id").eq("paid_by_player_id", p.id),
      db.from("manual_adjustments").select("id").eq("player_id", p.id),
      db.from("club_fund_shares").select("id").eq("player_id", p.id),
      db.from("club_fund_entries").select("id").eq("paid_by_player_id", p.id).eq("kind", "spend"),
    ]);

    groupWalletBalance = Number(gb?.balance ?? 0);
    personalWalletBalance = Number(pb?.balance ?? 0);
    balance = groupWalletBalance + personalWalletBalance;
    groupLedgerRows = gl;
    personalLedgerRows = pl;

    const bookingShareIds = new Set(
      (myBookingShares ?? []).map((r) => r.id as string),
    );
    const expenseShareIds = new Set(
      (myExpenseShares ?? []).map((r) => r.id as string),
    );
    const paymentIds = new Set(
      (myPayments ?? []).map((r) => r.id as string),
    );
    const expenseBoughtIds = new Set(
      (myExpensesBought ?? []).map((r) => r.id as string),
    );
    const manualAdjIds = new Set(
      (myManualAdj ?? []).map((r) => r.id as string),
    );
    const fundShareIds = new Set(
      (myFundShares ?? []).map((r) => r.id as string),
    );
    const fundPurchaseIds = new Set(
      (myFundPurchases ?? []).map((r) => r.id as string),
    );

    const playerGroupEntries = gl.filter((e) => {
      if (!e.source_id) return false;
      switch (e.source_type) {
        case "booking_share":
          return bookingShareIds.has(e.source_id);
        case "team_expense_share":
          return expenseShareIds.has(e.source_id);
        case "payment":
          return paymentIds.has(e.source_id);
        case "team_expense_credit":
          return expenseBoughtIds.has(e.source_id);
        case "club_fund_share":
          return fundShareIds.has(e.source_id);
        case "club_fund_credit":
          return fundPurchaseIds.has(e.source_id);
        case "manual_adjustment":
          return manualAdjIds.has(e.source_id);
        default:
          return false;
      }
    });

    const seen = new Set<string>();
    const merged: LedgerEntry[] = [];
    for (const row of [...playerGroupEntries, ...pl]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }
    ledger = merged;
  } else {
    const [{ data: pb }, pl] = await Promise.all([
      db
        .from("player_balances")
        .select("balance")
        .eq("player_id", p.id)
        .single(),
      loadWalletLedger("player_id", p.id),
    ]);
    personalWalletBalance = Number(pb?.balance ?? 0);
    balance = personalWalletBalance;
    personalLedgerRows = pl;
    ledger = pl;
  }

  type ExpShareMeta = {
    expenseCode: string | null;
    expenseDesc: string;
    paidByName: string | null;
  };
  const expShareMeta = new Map<string, ExpShareMeta>();

  const [
    { data: attendance },
    playerActivity,
    auth,
    playerLink,
    identities,
    inviteIndex,
    { data: settings },
  ] = await Promise.all([
    db
      .from("booking_attendance")
      .select(
        "id, booking_id, player_id, response_status, actual_status, bookings(id, booking_code, play_date, start_time, end_time, venue, court_number, status)",
      )
      .eq("player_id", p.id),
    fetchActivity(db, "player", p.id, 25),
    getAuthContext(),
    getPlayerLink(p.id),
    loadLinkedIdentities(),
    loadInviteIndex(db),
    db
      .from("app_settings")
      .select("roster_token, roster_public, gcash_number, bank_transfer_details")
      .single(),
  ]);

  type AttRow = {
    id: string;
    booking_id: string;
    player_id: string;
    response_status: ResponseStatus;
    actual_status: ActualStatus | null;
    bookings: Booking;
  };
  const att = (attendance ?? []) as unknown as AttRow[];
  const upcoming = att
    .filter((a) => a.bookings && a.bookings.play_date >= today &&
      (a.bookings.status === "booked" || a.bookings.status === "for_booking"))
    .sort((a, b) => a.bookings.play_date.localeCompare(b.bookings.play_date));

  const upcomingBookingIds = upcoming.map((a) => a.booking_id).filter(Boolean);
  const bookingCapMap = new Map<string, { totalCap: number; goingCount: number }>();
  type DisplayCourt = { court_number: string | null; start_time: string | null; end_time: string | null; max_players: number };
  const bookingCourtsMap = new Map<string, DisplayCourt[]>();
  let goingWaitRows: Awaited<ReturnType<typeof fetchGoingAndWaitlist>> = [];

  const orderedLedger = [...ledger].sort((a, b) => {
    const byDate = a.entry_date.localeCompare(b.entry_date);
    return byDate !== 0 ? byDate : a.created_at.localeCompare(b.created_at);
  });
  let runningBalance = 0;
  const fullStatement: { entry: LedgerEntry; running: number }[] = [];
  for (const e of orderedLedger) {
    if (!e.voided)
      runningBalance += Number(e.debit_amount) - Number(e.credit_amount);
    fullStatement.push({ entry: e, running: runningBalance });
  }
  fullStatement.reverse();

  const totalLedger = fullStatement.length;
  const totalLedgerPages = Math.max(1, Math.ceil(totalLedger / LEDGER_PAGE_SIZE));
  const ledgerFrom = (lpage - 1) * LEDGER_PAGE_SIZE;
  const statement = fullStatement.slice(ledgerFrom, ledgerFrom + LEDGER_PAGE_SIZE);
  const statementEntries = statement.map((s) => s.entry);

  const expShareIds = statementEntries
    .filter((e) => e.source_type === "team_expense_share" && e.source_id)
    .map((e) => e.source_id as string);

  const [courtsGoing, ledgerContext, ess] =
    await Promise.all([
      upcomingBookingIds.length > 0
        ? Promise.all([
            db.from("booking_courts").select("booking_id, court_number, start_time, end_time, max_players").in("booking_id", upcomingBookingIds).order("created_at"),
            fetchGoingAndWaitlist(db, upcomingBookingIds),
          ])
        : Promise.resolve([
            { data: [] as (DisplayCourt & { booking_id: string })[] },
            [] as Awaited<ReturnType<typeof fetchGoingAndWaitlist>>,
          ] as const),
      buildLedgerBookingContext(db, statementEntries),
      expShareIds.length > 0
        ? db
            .from("team_expense_shares")
            .select(
              "id, team_expenses(expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name))",
            )
            .in("id", expShareIds)
        : Promise.resolve({ data: [] }),
    ]);

  if (upcomingBookingIds.length > 0) {
    const [{ data: courtRows }, gw] = courtsGoing as [
      { data: (DisplayCourt & { booking_id: string })[] | null },
      Awaited<ReturnType<typeof fetchGoingAndWaitlist>>,
    ];
    goingWaitRows = gw;
    for (const c of courtRows ?? []) {
      const list = bookingCourtsMap.get(c.booking_id) ?? [];
      list.push({
        court_number: c.court_number,
        start_time: c.start_time,
        end_time: c.end_time,
        max_players: c.max_players,
      });
      bookingCourtsMap.set(c.booking_id, list);
    }
    const goingByBooking = new Map<string, number>();
    for (const r of goingWaitRows) {
      if (r.response_status !== "going") continue;
      goingByBooking.set(r.booking_id, (goingByBooking.get(r.booking_id) ?? 0) + 1);
    }
    for (const bid of upcomingBookingIds) {
      const cts = bookingCourtsMap.get(bid) ?? [];
      const unlimited = cts.length === 0 || cts.some((c) => c.max_players === 0);
      const totalCap = unlimited ? 0 : cts.reduce((s, c) => s + c.max_players, 0);
      bookingCapMap.set(bid, { totalCap, goingCount: goingByBooking.get(bid) ?? 0 });
    }
  }

  for (const s of (ess.data ?? []) as unknown as {
    id: string;
    team_expenses: {
      expense_code: string | null;
      description: string;
      players: { name: string } | null;
      player_groups: { name: string } | null;
    } | null;
  }[]) {
    expShareMeta.set(s.id, {
      expenseCode: s.team_expenses?.expense_code ?? null,
      expenseDesc: s.team_expenses?.description ?? "Team expense",
      paidByName:
        s.team_expenses?.players?.name ??
        s.team_expenses?.player_groups?.name ??
        null,
    });
  }

  const promotedCodes = new Set(
    playerActivity
      .filter((row) => row.action.includes("Waitlist → Going"))
      .map((row) => {
        const m = row.action.match(/RSVP on ([^:]+):/);
        return m?.[1]?.trim() ?? "";
      })
      .filter(Boolean),
  );

  const d = describeBalance(balance);
  const face = playerFace(p.id, p, identities);
  const invited = inviteLineFromIndex(p.id, inviteIndex, identities);
  const teamToken =
    settings?.roster_public && settings.roster_token
      ? settings.roster_token
      : null;
  const payBank = (settings?.bank_transfer_details as string | null) ?? null;
  const payGcash = (settings?.gcash_number as string | null) ?? null;

  const toChargeRows = (rows: LedgerEntry[]): LedgerRow[] =>
    rows
      .filter((e) => !e.voided)
      .map((e) => ({
        entry_date: e.entry_date,
        created_at: e.created_at,
        source_type: e.source_type,
        source_id: e.source_id,
        description: e.description,
        debit_amount: Number(e.debit_amount),
        credit_amount: Number(e.credit_amount),
      }));
  const openCharges = pooled
    ? [
        ...openChargesFromLedger(toChargeRows(groupLedgerRows)),
        ...openChargesFromLedger(toChargeRows(personalLedgerRows)),
      ]
    : openChargesFromLedger(toChargeRows(personalLedgerRows));
  const openGameCount = openCharges.filter(
    (c) => c.source_type === "booking_share",
  ).length;

  const ledgerPageUrl = (n: number) =>
    `/p/${token}${n > 1 ? `?lpage=${n}` : ""}`;

  return (
    <>
    <RememberPublicTokens
      playerToken={token}
      teamToken={teamToken}
      claimPlayer={auth.profile?.player_id === p.id}
      skipPlayer={face.verified && auth.profile?.player_id !== p.id}
    />
    <main className={publicMainClass}>
      <ScrollToHash />
      <div className="mb-3 flex justify-end">
        <AppearanceToggle />
      </div>
      <header className="mb-5 text-center">
        {face.verified ? (
          <div className="mb-2 flex justify-center">
            <PlayerAvatar
              name={face.name}
              src={face.avatarUrl}
              size="lg"
              verified
            />
          </div>
        ) : (
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
            🏓
          </div>
        )}
        <h1
          className={`flex flex-wrap items-center justify-center gap-2 text-2xl ${publicPrimaryText}`}
        >
          {face.name}
        </h1>
        {invited ? (
          <p className={`mt-1 ${publicMetaText}`}>{invited}</p>
        ) : null}
        <p className={`mt-0.5 ${publicMetaText}`}>Dinkering Pickleball</p>
        {face.verified ? null : (
          <div className="mt-3 flex justify-center">
            <SaveAsMyPage playerToken={token} teamToken={teamToken} />
          </div>
        )}
      </header>

      {auth.profile?.player_id === p.id ? (
        <p className="mb-4 text-center text-sm">
          <PendingLink href="/account" busyLabel="Opening account…" className="font-medium text-emerald-700">
            Account settings
          </PendingLink>
        </p>
      ) : playerLink.pendingClaim ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
          A login request for this name is waiting for the admin. You can keep
          using this private link.
        </p>
      ) : !playerLink.linked &&
        auth.profile?.role !== "admin" &&
        !auth.profile?.player_id &&
        !auth.pendingRequest ? (
        <p className="mb-4 text-center">
          <PendingLink
            href={`/claim/${token}`}
            busyLabel="Opening claim…"
            className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200"
          >
            Set up my login
          </PendingLink>
        </p>
      ) : null}

      {upcoming[0] ? (() => {
        const next = upcoming[0];
        const cts = bookingCourtsMap.get(next.booking_id) ?? [];
        const overall = overallCourtTimeRange(cts);
        const cap = bookingCapMap.get(next.booking_id);
        const rsvp =
          next.response_status === "going"
            ? "You're Going"
            : next.response_status === "waitlist"
              ? "You're waitlisted"
              : next.response_status === "not_going"
                ? "You're not going"
                : "RSVP still open";
        return (
          <Card className="mb-5 border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
              My next game
            </p>
            <p className={`mt-1 text-lg ${publicPrimaryText}`}>
              {formatDate(next.bookings.play_date)}
              {next.bookings.booking_code
                ? ` · ${next.bookings.booking_code}`
                : ""}
            </p>
            <p className={`mt-0.5 ${publicHintText}`}>
              {[next.bookings.venue, overall].filter(Boolean).join(" · ") ||
                "Time TBA"}
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-800">
              {rsvp}
              {cap && cap.totalCap > 0
                ? ` · ${cap.goingCount}/${cap.totalCap} going`
                : ""}
            </p>
            <a
              href={`#booking-${next.bookings.id}`}
              className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
            >
              Jump to RSVP
            </a>
          </Card>
        );
      })() : null}

      {pooled ? (
        /* ── Pooled player: two clearly labelled wallet panels ── */
        <div className="mb-5 grid grid-cols-2 gap-3">
          {/* Shared / group wallet */}
          {(() => {
            const dg = describeBalance(groupWalletBalance ?? 0);
            return (
              <Card
                className={`p-4 text-center ${
                  dg.tone === "collect"
                    ? "border-rose-200 bg-rose-50"
                    : dg.tone === "credit"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Shared wallet
                </p>
                <PendingLink
                  href={`/g/${pooled.player_groups.public_token}`}
                  busyLabel="Opening group page…"
                  className="mt-0.5 block text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 active:text-emerald-900"
                >
                  {pooled.player_groups.name}
                </PendingLink>
                <p
                  className={`mt-2 text-2xl font-bold ${
                    dg.tone === "collect"
                      ? "text-rose-700"
                      : dg.tone === "credit"
                        ? "text-emerald-700"
                        : "text-slate-500"
                  }`}
                >
                  {dg.tone === "settled" ? "Settled 🎉" : formatMoney(dg.amount)}
                </p>
                <p className={`mt-1 text-xs ${publicHintText}`}>
                  {dg.tone === "collect"
                    ? "shared, owes the team"
                    : dg.tone === "credit"
                      ? "shared credit"
                      : "all paid up"}
                </p>
              </Card>
            );
          })()}

          {/* Personal wallet */}
          {(() => {
            const dp = describeBalance(personalWalletBalance);
            return (
              <Card
                className={`p-4 text-center ${
                  dp.tone === "collect"
                    ? "border-rose-200 bg-rose-50"
                    : dp.tone === "credit"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Personal wallet
                </p>
                <p className={`mt-0.5 text-sm ${publicHintText}`}>your own</p>
                <p
                  className={`mt-2 text-2xl font-bold ${
                    dp.tone === "collect"
                      ? "text-rose-700"
                      : dp.tone === "credit"
                        ? "text-emerald-700"
                        : "text-slate-500"
                  }`}
                >
                  {dp.tone === "settled" ? "Settled 🎉" : formatMoney(dp.amount)}
                </p>
                <p className={`mt-1 text-xs ${publicHintText}`}>
                  {dp.tone === "collect"
                    ? "personal, owes the team"
                    : dp.tone === "credit"
                      ? "personal credit"
                      : "all paid up"}
                </p>
              </Card>
            );
          })()}
        </div>
      ) : (
        /* ── Non-pooled player: single balance card ── */
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
              <p className="text-base font-medium text-rose-800">You currently owe</p>
              <p className="mt-1 text-4xl font-bold text-rose-700">
                {formatMoney(d.amount)}
              </p>
            </>
          ) : d.tone === "credit" ? (
            <>
              <p className="text-base font-medium text-emerald-800">You have credit</p>
              <p className="mt-1 text-4xl font-bold text-emerald-700">
                {formatMoney(d.amount)}
              </p>
              <p className="mt-1.5 text-sm font-medium text-emerald-700">
                Applied automatically to future charges
              </p>
            </>
          ) : (
            <>
              <p className={`text-base ${publicMetaText}`}>Your balance</p>
              <p className="mt-1 text-4xl font-bold text-slate-800">You&apos;re all settled 🎉</p>
              <p className="mt-1.5 text-sm text-slate-600">
                Nothing outstanding. See you on court.
              </p>
            </>
          )}
          {d.tone === "collect" ? (
            <BalancePlainSummary
              amountOwed={d.amount}
              openGames={openGameCount}
            />
          ) : null}
        </Card>
      )}

      {pooled && d.tone === "collect" ? (
        <p className="mb-3 px-1">
          <BalancePlainSummary
            amountOwed={d.amount}
            openGames={openGameCount}
          />
        </p>
      ) : null}

      <div className="mb-5">
        <HowToPay bank={payBank} gcash={payGcash} />
        {d.tone === "collect" ? (
          <PaymentProofForm token={token} owed={d.amount} />
        ) : null}
      </div>

      <PublicSection title="Upcoming games">
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming games yet"
            description="Nothing on the calendar right now. The next session will show up here as soon as it's booked."
          />
        ) : (
          <UpcomingGamesFilter
            items={upcoming.map((a) => {
              const cts = bookingCourtsMap.get(a.booking_id) ?? [];
              const merged = mergeCourts(cts);
              const overall = overallCourtTimeRange(cts);
              const lockAt = getRsvpLockAt(
                a.bookings.play_date,
                cts,
                a.bookings.start_time,
              );
              const locked = isRsvpLocked(
                a.bookings.play_date,
                cts,
                a.bookings.start_time,
              );
              const detailsHref = teamToken
                ? `/schedule/${teamToken}/${a.bookings.id}`
                : null;
              const node = (
                <Card id={`booking-${a.bookings.id}`} className="scroll-mt-6 overflow-visible p-4">
                  <div className="flex items-start gap-3">
                    <DateChip value={a.bookings.play_date} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-base ${publicPrimaryText}`}>
                        {formatDate(a.bookings.play_date)}
                      </p>
                      {a.bookings.venue || overall ? (
                        <p className={`mt-0.5 ${publicHintText}`}>
                          {[a.bookings.venue, overall].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {merged.filter((m) => formatCourtTime(m) || m.label !== "Court").length >
                      0 ? (
                        <div className="mt-1 space-y-0.5">
                          {merged
                            .filter(
                              (m) => formatCourtTime(m) || m.label !== "Court",
                            )
                            .map((m, i) => (
                              <p key={i} className={publicHintText}>
                                {m.label}
                                {formatCourtTime(m)
                                  ? `: ${formatCourtTime(m)}`
                                  : ""}
                              </p>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3">
                    <RsvpForm
                      token={token}
                      bookingId={a.bookings.id}
                      currentStatus={a.response_status}
                      locked={locked}
                      lockAtIso={lockAt && !locked ? lockAt.toISOString() : null}
                      waitlistPosition={waitlistPosition(
                        goingWaitRows,
                        a.booking_id,
                        p.id,
                      )}
                      promoted={
                        a.response_status === "going" &&
                        !!a.bookings.booking_code &&
                        promotedCodes.has(a.bookings.booking_code)
                      }
                      isFull={(() => {
                        const cap = bookingCapMap.get(a.booking_id);
                        return !!(cap && cap.totalCap > 0 && cap.goingCount >= cap.totalCap);
                      })()}
                    />
                  </div>
                  {detailsHref ? (
                    <PendingLink
                      href={detailsHref}
                      busyLabel="Opening game…"
                      className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
                    >
                      See more details of booking
                    </PendingLink>
                  ) : null}
                </Card>
              );
              return { key: a.id, status: a.response_status, node };
            })}
          />
        )}
      </PublicSection>

      <PublicSection title="Charges & payments">
        {pooled ? (
          <p className={`mb-3 px-1 ${publicHintText}`}>
            Your charges on the shared wallet. The full group wallet is on{" "}
            <PendingLink
              href={`/g/${pooled.player_groups.public_token}`}
              busyLabel="Opening group page…"
              className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2"
            >
              {pooled.player_groups.name}
            </PendingLink>.
          </p>
        ) : null}
        <PlayerActivityList
          rows={statement.map(({ entry, running }) => {
            const bookingCtx = formatBookingContext(ledgerContext.get(entry.id));
            const eMeta =
              entry.source_type === "team_expense_share" && entry.source_id
                ? expShareMeta.get(entry.source_id)
                : null;
            const who = pooled
              ? entry.player_group_id
                ? "Shared wallet"
                : "Personal"
              : null;
            const detail = [who, bookingCtx].filter(Boolean).join(" · ");
            return {
              id: entry.id,
              title: activityTitle(entry, {
                expenseDesc: eMeta?.expenseDesc,
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
          pageHref={ledgerPageUrl}
          showRunning={!pooled}
        />
      </PublicSection>

      <footer className="mt-8 text-center text-sm text-slate-400">
        Private link · do not share publicly
      </footer>
    </main>
    <PublicBottomNav playerToken={token} teamToken={teamToken} />
    </>
  );
}
