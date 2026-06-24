import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import {
  formatMoney,
  formatDate,
  describeBalance,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import {
  buildLedgerBookingContext,
  formatBookingContext,
} from "@/lib/booking-context";
import { buildTransferItemEnrichment } from "@/lib/ledger-attribution";
import {
  PublicNavLink,
  PublicSection,
  publicMainClass,
  publicPrimaryText,
  publicMetaText,
  publicHintText,
} from "@/components/public-ui";
import type {
  Booking,
  BookingAttendance,
  LedgerEntry,
  Player,
} from "@/lib/types";
import { RsvpForm } from "./RsvpForm";
import { ScrollToHash } from "@/components/ScrollToHash";

const STATEMENT_LABELS: Record<string, string> = {
  booking_share: "Court",
  payment: "Payment",
  team_expense_share: "Team expense",
  team_expense_credit: "Reimbursement",
  manual_adjustment: "Adjustment",
};

export const dynamic = "force-dynamic";

const LEDGER_PAGE_SIZE = 10;

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

  if (pooled) {
    // Fetch balances, both ledgers, and this player's source-record IDs in parallel.
    // The source IDs let us filter the group ledger to only entries that belong to
    // this specific player (not the whole group).
    const [
      { data: gb },
      { data: pb },
      { data: gl },
      { data: pl },
      { data: myBookingShares },
      { data: myExpenseShares },
      { data: myPayments },
      { data: myExpensesBought },
      { data: myManualAdj },
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
      db
        .from("ledger_entries")
        .select("*")
        .eq("player_group_id", pooled.player_group_id)
        .order("entry_date"),
      db
        .from("ledger_entries")
        .select("*")
        .eq("player_id", p.id)
        .order("entry_date"),
      db.from("booking_shares").select("id").eq("player_id", p.id),
      db.from("team_expense_shares").select("id").eq("player_id", p.id),
      db.from("payments").select("id").eq("payer_player_id", p.id),
      db.from("team_expenses").select("id").eq("paid_by_player_id", p.id),
      db.from("manual_adjustments").select("id").eq("player_id", p.id),
    ]);

    // Keep wallets separate for display; combine for ledger running-balance math.
    groupWalletBalance = Number(gb?.balance ?? 0);
    personalWalletBalance = Number(pb?.balance ?? 0);
    balance = groupWalletBalance + personalWalletBalance;

    // Build lookup sets per source type
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

    // Keep only group entries that belong to this player
    const playerGroupEntries = ((gl ?? []) as LedgerEntry[]).filter((e) => {
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
        case "manual_adjustment":
          return manualAdjIds.has(e.source_id);
        default:
          return false;
      }
    });

    // Merge with personal ledger (pre-group history), dedup by id
    const seen = new Set<string>();
    const merged: LedgerEntry[] = [];
    for (const row of [
      ...playerGroupEntries,
      ...((pl ?? []) as LedgerEntry[]),
    ]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }
    ledger = merged;
  } else {
    const [{ data: pb }, { data: pl }] = await Promise.all([
      db
        .from("player_balances")
        .select("balance")
        .eq("player_id", p.id)
        .single(),
      db
        .from("ledger_entries")
        .select("*")
        .eq("player_id", p.id)
        .order("entry_date"),
    ]);
    personalWalletBalance = Number(pb?.balance ?? 0);
    balance = personalWalletBalance;
    ledger = (pl ?? []) as LedgerEntry[];
  }

  // Enrich expense-share entries with expense description + who paid —
  // applies for both pooled and non-pooled players.
  type ExpShareMeta = {
    expenseCode: string | null;
    expenseDesc: string;
    paidByName: string | null;
  };
  const expShareMeta = new Map<string, ExpShareMeta>();
  const expShareIds = ledger
    .filter((e) => e.source_type === "team_expense_share" && e.source_id)
    .map((e) => e.source_id as string);
  if (expShareIds.length > 0) {
    const { data: ess } = await db
      .from("team_expense_shares")
      .select(
        "id, team_expenses(expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name))",
      )
      .in("id", expShareIds);
    for (const s of (ess ?? []) as unknown as {
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
  }

  const { data: attendance } = await db
    .from("booking_attendance")
    .select(
      "*, bookings(id, booking_code, play_date, start_time, end_time, venue, court_number, status)",
    )
    .eq("player_id", p.id);

  type AttRow = BookingAttendance & { bookings: Booking };
  const att = (attendance ?? []) as AttRow[];
  const upcoming = att
    .filter((a) => a.bookings && a.bookings.play_date >= today && a.bookings.status === "booked")
    .sort((a, b) => a.bookings.play_date.localeCompare(b.bookings.play_date));
  const history = att
    .filter((a) => a.bookings && !(a.bookings.play_date >= today && a.bookings.status === "booked"))
    .sort((a, b) => b.bookings.play_date.localeCompare(a.bookings.play_date));

  const d = describeBalance(balance);
  const [ledgerContext, transferItemMap] = await Promise.all([
    buildLedgerBookingContext(db, ledger),
    buildTransferItemEnrichment(db, ledger),
  ]);

  const { data: settings } = await db
    .from("app_settings")
    .select("roster_token, roster_public")
    .single();
  const teamToken =
    settings?.roster_public && settings.roster_token
      ? settings.roster_token
      : null;

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
  const ledgerPageUrl = (n: number) =>
    `/p/${token}${n > 1 ? `?lpage=${n}` : ""}`;

  return (
    <main className={publicMainClass}>
      <ScrollToHash />
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
          🏓
        </div>
        <h1 className={`text-2xl ${publicPrimaryText}`}>
          {p.display_name || p.name}
        </h1>
        <p className={`mt-0.5 ${publicMetaText}`}>Dinkering Pickleball</p>
      </header>

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
                <Link
                  href={`/g/${pooled.player_groups.public_token}`}
                  className="mt-0.5 block text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 active:text-emerald-900"
                >
                  {pooled.player_groups.name}
                </Link>
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
                    ? "shared — owes the team"
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
                    ? "personal — owes the team"
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
              <p className="mt-1 text-4xl font-bold text-slate-800">Settled 🎉</p>
            </>
          )}
        </Card>
      )}

      {teamToken ? (
        <nav className="mb-5 flex flex-wrap justify-center gap-2">
          <PublicNavLink href={`/board/${teamToken}`}>Team balances</PublicNavLink>
          <PublicNavLink href={`/schedule/${teamToken}`}>Upcoming games</PublicNavLink>
        </nav>
      ) : null}

      <PublicSection title="Upcoming games">
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming games" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => {
              const ctx = formatBookingContext(a.bookings);
              return (
                <Card key={a.id} id={`booking-${a.bookings.id}`} className="scroll-mt-6 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg ${publicPrimaryText}`}>
                        {formatDate(a.bookings.play_date)}
                      </p>
                      {a.bookings.booking_code ? (
                        <p className={`mt-0.5 text-sm font-medium text-emerald-800`}>
                          {a.bookings.booking_code}
                        </p>
                      ) : null}
                      {ctx ? (
                        <p className={`mt-1 ${publicHintText}`}>{ctx}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={a.response_status} size="md" />
                  </div>
                  <RsvpForm
                    token={token}
                    bookingId={a.bookings.id}
                    currentStatus={a.response_status}
                  />
                </Card>
              );
            })}
          </div>
        )}
      </PublicSection>

      <PublicSection title="Charges & payments">
        {fullStatement.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <>
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {statement.map(({ entry, running }) => {
                const bookingCtx = formatBookingContext(
                  ledgerContext.get(entry.id),
                );
                const charge = Number(entry.debit_amount);
                const credit = Number(entry.credit_amount);
                const isCharge = charge > 0;
                const balLabel =
                  Math.abs(running) < SETTLE_TOLERANCE
                    ? "Settled"
                    : running > 0
                      ? `${formatMoney(running)} owed`
                      : `${formatMoney(-running)} credit`;

                // Expense share enrichment — augment label and add sub-context
                const playerDisplayName =
                  p.display_name?.trim() || p.name;
                const isGroupEntry = entry.player_group_id !== null;
                const eMeta =
                  entry.source_type === "team_expense_share" &&
                  entry.source_id
                    ? expShareMeta.get(entry.source_id)
                    : null;

                // Description: append "(PlayerName)" for shares in a group wallet
                let displayDesc =
                  entry.description ||
                  STATEMENT_LABELS[entry.source_type] ||
                  "Entry";
                if (
                  isGroupEntry &&
                  (entry.source_type === "team_expense_share" ||
                    entry.source_type === "booking_share")
                ) {
                  const groupName = pooled?.player_groups.name;
                  displayDesc = groupName
                    ? `${displayDesc} (${playerDisplayName} · ${groupName})`
                    : `${displayDesc} (${playerDisplayName})`;
                }

                // Sub-context line (date + venue/time + expense detail)
                const expenseSubCtx = eMeta
                  ? [
                      eMeta.expenseCode
                        ? `${eMeta.expenseCode} · ${eMeta.expenseDesc}`
                        : eMeta.expenseDesc,
                      eMeta.paidByName
                        ? `Paid by ${eMeta.paidByName}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null;

                // Detect balance-transfer entries — use DB-enriched items when
                // available (resolves expense details for old & new format).
                const transferParts = (() => {
                  const d = entry.description;
                  if (!d?.startsWith("Transfer ")) return null;
                  const dashIdx = d.indexOf(" — ");
                  if (dashIdx === -1) return null;
                  const header = d.slice(0, dashIdx).trim();
                  const enriched = transferItemMap.get(entry.id);
                  if (enriched) return { header, items: enriched };
                  const rest = d.slice(dashIdx + 3).trim();
                  const items = rest.length > 0
                    ? rest.split(";").map((s) => s.trim()).filter(Boolean)
                    : [];
                  return { header, items };
                })();

                return (
                  <div
                    key={entry.id}
                    className={`flex items-start justify-between gap-3 px-4 py-3.5 ${
                      entry.voided ? "text-slate-400 line-through" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      {transferParts ? (
                        <>
                          <p className={`text-base ${publicPrimaryText}`}>
                            {transferParts.header}
                          </p>
                          {transferParts.items.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {transferParts.items.map((item, i) => (
                                <li
                                  key={i}
                                  className={`flex items-baseline gap-1 ${publicHintText}`}
                                >
                                  <span className="shrink-0 text-slate-300">↳</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : (
                        <p className={`text-base ${publicPrimaryText}`}>
                          {displayDesc}
                        </p>
                      )}
                      <p className={`mt-0.5 ${publicHintText}`}>
                        {formatDate(entry.entry_date)}
                        {bookingCtx ? ` · ${bookingCtx}` : ""}
                      </p>
                      {expenseSubCtx ? (
                        <p className={`mt-0.5 ${publicHintText}`}>
                          {expenseSubCtx}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-base font-bold ${
                          isCharge ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {isCharge
                          ? formatMoney(charge)
                          : `− ${formatMoney(credit)}`}
                      </p>
                      {!entry.voided ? (
                        <p className={`mt-0.5 text-sm font-medium ${
                          Math.abs(running) < SETTLE_TOLERANCE
                            ? "text-slate-500"
                            : running > 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                        }`}>
                          {balLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </Card>
            {/* Pagination */}
            <div className="mt-3 flex items-center justify-between gap-3 px-1">
              <p className={publicHintText}>
                {ledgerFrom + 1}–{Math.min(ledgerFrom + LEDGER_PAGE_SIZE, totalLedger)}{" "}
                of {totalLedger} entr{totalLedger === 1 ? "y" : "ies"}
              </p>
              {totalLedgerPages > 1 ? (
                <div className="flex items-center gap-2 text-sm font-medium">
                  {lpage > 1 ? (
                    <Link
                      href={ledgerPageUrl(lpage - 1)}
                      className="rounded-lg px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-50"
                    >
                      ← Newer
                    </Link>
                  ) : null}
                  <span className={publicHintText}>
                    {lpage} / {totalLedgerPages}
                  </span>
                  {lpage < totalLedgerPages ? (
                    <Link
                      href={ledgerPageUrl(lpage + 1)}
                      className="rounded-lg px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-50"
                    >
                      Older →
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className={`mt-1.5 px-1 ${publicHintText}`}>
              Charges in <span className="font-semibold text-rose-700">red</span>,
              payments in{" "}
              <span className="font-semibold text-emerald-700">green</span>.
            </p>
          </>
        )}
      </PublicSection>

      <PublicSection title="Appearance history">
        {history.length === 0 ? (
          <EmptyState title="No past games yet" />
        ) : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {history.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <div>
                  <span className={`text-base ${publicPrimaryText}`}>
                    {a.bookings.booking_code}
                  </span>
                  <span className={`ml-2 ${publicHintText}`}>
                    {formatDate(a.bookings.play_date)}
                  </span>
                </div>
                <StatusBadge
                  status={a.actual_status ?? a.response_status}
                  size="md"
                />
              </div>
            ))}
          </Card>
        )}
      </PublicSection>

      <footer className="mt-8 text-center text-sm text-slate-400">
        Private link · do not share publicly
      </footer>
    </main>
  );
}
