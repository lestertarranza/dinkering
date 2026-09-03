import type { SupabaseClient } from "@supabase/supabase-js";
import { round2, resolveWalletOwnersForPlayers } from "@/lib/ledger";
import { isSettled } from "@/lib/format";
import { formatBookingContext } from "@/lib/booking-context";
import type { SourceType } from "@/lib/types";

export type OpenCharge = {
  source_type: SourceType;
  source_id: string;
  entry_date: string;
  label: string;
  booking_id: string | null;
  team_expense_id: string | null;
  remaining: number;
};

type Wallet = {
  player_id: string | null;
  player_group_id: string | null;
};

export type LedgerRow = {
  entry_date: string;
  created_at: string;
  source_type: SourceType;
  source_id: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
};

const CHARGE_TYPES = new Set<SourceType>([
  "booking_share",
  "team_expense_share",
  "manual_adjustment",
]);

const PAGE_SIZE = 1000;

/**
 * Fetch every row for a query, transparently paging past PostgREST's default
 * 1000-row cap. The caller supplies a factory that applies `.range(from, to)`
 * to an already-ordered query; the query MUST include a deterministic order
 * (e.g. an `id` tiebreaker) so pages don't skip or duplicate rows.
 */
async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await makeQuery(from, from + PAGE_SIZE - 1);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

/** Split an array into chunks of at most `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Fetch a wallet's non-voided ledger rows, oldest first (fully paginated). */
async function fetchWalletLedger(
  db: SupabaseClient,
  wallet: Wallet,
): Promise<LedgerRow[]> {
  const column = wallet.player_group_id
    ? "player_group_id"
    : wallet.player_id
      ? "player_id"
      : null;
  const value = wallet.player_group_id ?? wallet.player_id;
  if (!column || !value) return [];

  return fetchAllRows<LedgerRow>((from, to) =>
    db
      .from("ledger_entries")
      .select(
        "entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount",
      )
      .eq("voided", false)
      .eq(column, value)
      .order("entry_date")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
}

/**
 * Apply credits to charges chronologically (FIFO) and return the open charges
 * with their remaining unpaid amounts. Pure computation over ledger rows.
 */
function computeOpenCharges(rows: LedgerRow[]): OpenCharge[] {
  type Pending = OpenCharge & { remaining: number };
  const pending: Pending[] = [];
  let creditPool = 0;

  const applyCredits = () => {
    if (creditPool <= 0) return;
    for (const charge of pending) {
      if (creditPool <= 0 || charge.remaining <= 0) continue;
      const applied = Math.min(charge.remaining, creditPool);
      charge.remaining = round2(charge.remaining - applied);
      creditPool = round2(creditPool - applied);
    }
  };

  for (const row of rows) {
    const debit = Number(row.debit_amount);
    const credit = Number(row.credit_amount);

    if (credit > 0) {
      creditPool = round2(creditPool + credit);
      applyCredits();
      continue;
    }

    if (debit <= 0 || !CHARGE_TYPES.has(row.source_type) || !row.source_id) {
      continue;
    }

    const charge: Pending = {
      source_type: row.source_type,
      source_id: row.source_id,
      entry_date: row.entry_date,
      label: row.description ?? row.source_type,
      booking_id: null,
      team_expense_id: null,
      remaining: debit,
    };
    pending.push(charge);

    if (creditPool > 0) {
      const applied = Math.min(charge.remaining, creditPool);
      charge.remaining = round2(charge.remaining - applied);
      creditPool = round2(creditPool - applied);
    }
  }

  return pending.filter((c) => !isSettled(c.remaining));
}

/**
 * Load unpaid charge items for a wallet, oldest first (FIFO), with friendly
 * labels (booking/expense context). Used for the bulk-payment UI/allocation.
 */
export async function getOpenCharges(
  db: SupabaseClient,
  wallet: Wallet,
): Promise<OpenCharge[]> {
  const rows = await fetchWalletLedger(db, wallet);
  const open = computeOpenCharges(rows);
  await enrichChargeLabels(db, open);
  return open;
}

/**
 * Compute remaining (unpaid) amount for every charge in a wallet, keyed by the
 * ledger source_id. A source_id absent from the map (or ≈0) is fully settled.
 * Skips label enrichment, so it costs a single query (used on detail pages).
 */
export async function chargeRemainingBySource(
  db: SupabaseClient,
  wallet: Wallet,
): Promise<Map<string, number>> {
  const rows = await fetchWalletLedger(db, wallet);
  const open = computeOpenCharges(rows);
  const map = new Map<string, number>();
  for (const c of open) map.set(c.source_id, c.remaining);
  return map;
}

async function enrichChargeLabels(db: SupabaseClient, charges: OpenCharge[]) {
  const bookingShareIds = charges
    .filter((c) => c.source_type === "booking_share")
    .map((c) => c.source_id);
  const expenseShareIds = charges
    .filter((c) => c.source_type === "team_expense_share")
    .map((c) => c.source_id);

  const bookingMeta = new Map<
    string,
    { booking_id: string; label: string }
  >();
  if (bookingShareIds.length) {
    const { data } = await db
      .from("booking_shares")
      .select(
        "id, booking_id, bookings(booking_code, play_date, start_time, end_time, venue, court_number)",
      )
      .in("id", bookingShareIds);
    for (const s of (data ?? []) as unknown as {
      id: string;
      booking_id: string;
      bookings: {
        booking_code: string | null;
        play_date: string;
        start_time: string | null;
        end_time: string | null;
        venue: string | null;
        court_number: string | null;
      } | null;
    }[]) {
      const b = s.bookings;
      const ctx = b ? formatBookingContext(b) : "";
      bookingMeta.set(s.id, {
        booking_id: s.booking_id,
        label: b
          ? ctx
            ? `Court — ${b.booking_code ?? "booking"} · ${ctx}`
            : `Court — ${b.booking_code ?? "booking"}`
          : "Court share",
      });
    }
  }

  const expenseMeta = new Map<
    string,
    { team_expense_id: string; label: string }
  >();
  if (expenseShareIds.length) {
    const { data } = await db
      .from("team_expense_shares")
      .select(
        "id, team_expense_id, team_expenses(expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name))",
      )
      .in("id", expenseShareIds);
    for (const s of (data ?? []) as unknown as {
      id: string;
      team_expense_id: string;
      team_expenses: {
        expense_code: string | null;
        description: string;
        players: { name: string } | null;
        player_groups: { name: string } | null;
      } | null;
    }[]) {
      const e = s.team_expenses;
      const paidBy = e?.players?.name ?? e?.player_groups?.name ?? null;
      expenseMeta.set(s.id, {
        team_expense_id: s.team_expense_id,
        label: e
          ? [
              `Expense — ${e.expense_code ?? "Expense"} · ${e.description}`,
              paidBy ? `Paid by ${paidBy}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : "Team expense share",
      });
    }
  }

  for (const c of charges) {
    if (c.source_type === "booking_share") {
      const meta = bookingMeta.get(c.source_id);
      if (meta) {
        c.booking_id = meta.booking_id;
        c.label = meta.label;
      }
    } else if (c.source_type === "team_expense_share") {
      const meta = expenseMeta.get(c.source_id);
      if (meta) {
        c.team_expense_id = meta.team_expense_id;
        c.label = meta.label;
      }
    }
  }
}

/**
 * Compute open charges for multiple players in one pass — takes a pre-loaded
 * map of player_id → non-voided ledger rows and returns the open charges per
 * player (no DB calls). Used by the dashboard to avoid N+1 queries.
 */
export function batchComputePlayerOpenCharges(
  entriesByPlayer: Map<string, LedgerRow[]>,
): Map<string, OpenCharge[]> {
  const result = new Map<string, OpenCharge[]>();
  for (const [playerId, rows] of entriesByPlayer) {
    result.set(playerId, computeOpenCharges(rows));
  }
  return result;
}

/**
 * Compute the still-open (unsettled) amount for each booking share, accounting
 * for BOTH explicit payments AND credit auto-applied from the player's wallet
 * (FIFO) — e.g. a player who carried a credit balance into the booking. Returns
 * a map of booking_share id → remaining amount; a share absent from the map is
 * fully settled (remaining 0).
 *
 * Shared by the booking detail page, the bookings list, and the dashboard so
 * all three reconcile exactly with what each player still owes in the ledger.
 */
export async function computeBookingShareRemaining(
  db: SupabaseClient,
  shares: { id: string; booking_id: string; player_id: string | null }[],
  bookingDateMap: Map<string, string>,
  today: string,
): Promise<Map<string, number>> {
  const remainingByShare = new Map<string, number>();
  if (shares.length === 0) return remainingByShare;

  // Resolve each share's owning wallet using its booking play_date (matches how
  // the charge was originally routed). Batch one resolve call per unique date.
  const playersByDate = new Map<string, Set<string>>();
  for (const s of shares) {
    if (!s.player_id) continue;
    const date = bookingDateMap.get(s.booking_id) ?? today;
    const set = playersByDate.get(date) ?? new Set<string>();
    set.add(s.player_id);
    playersByDate.set(date, set);
  }
  const walletOwners = new Map<string, Wallet>();
  await Promise.all(
    [...playersByDate.entries()].map(async ([date, pids]) => {
      const owners = await resolveWalletOwnersForPlayers(db, [...pids], date);
      for (const [pid, owner] of owners)
        walletOwners.set(`${pid}:${date}`, owner);
    }),
  );
  const shareWallet = (s: {
    booking_id: string;
    player_id: string | null;
  }): Wallet => {
    if (s.player_id) {
      const date = bookingDateMap.get(s.booking_id) ?? today;
      return (
        walletOwners.get(`${s.player_id}:${date}`) ?? {
          player_id: s.player_id,
          player_group_id: null,
        }
      );
    }
    return { player_id: null, player_group_id: null };
  };

  const walletPIds = new Set<string>();
  const walletGIds = new Set<string>();
  for (const s of shares) {
    const w = shareWallet(s);
    if (w.player_id) walletPIds.add(w.player_id);
    if (w.player_group_id) walletGIds.add(w.player_group_id);
  }

  const [pLedger, gLedger] = await Promise.all([
    fetchLedgerByOwners(db, "player_id", [...walletPIds]),
    fetchLedgerByOwners(db, "player_group_id", [...walletGIds]),
  ]);

  const walletEntries = new Map<string, LedgerRow[]>();
  for (const row of pLedger as (LedgerRow & { player_id: string })[]) {
    const key = `p:${row.player_id}`;
    const list = walletEntries.get(key) ?? [];
    list.push(row);
    walletEntries.set(key, list);
  }
  for (const row of gLedger as (LedgerRow & {
    player_group_id: string;
  })[]) {
    const key = `g:${row.player_group_id}`;
    const list = walletEntries.get(key) ?? [];
    list.push(row);
    walletEntries.set(key, list);
  }

  const chargesByWallet = batchComputePlayerOpenCharges(walletEntries);
  for (const charges of chargesByWallet.values()) {
    for (const c of charges) {
      if (c.source_type === "booking_share")
        remainingByShare.set(c.source_id, c.remaining);
    }
  }
  return remainingByShare;
}

/**
 * Load every non-voided ledger row for a set of wallet owners (players or
 * groups), fully paginated and chunked so neither the PostgREST 1000-row cap
 * nor a huge `IN (...)` list truncates the result. Each row carries its owner
 * column so callers can bucket by wallet.
 */
async function fetchLedgerByOwners(
  db: SupabaseClient,
  column: "player_id" | "player_group_id",
  ids: string[],
): Promise<LedgerRow[]> {
  if (ids.length === 0) return [];
  const all: LedgerRow[] = [];
  for (const ids2 of chunk(ids, 200)) {
    const rows = await fetchAllRows<LedgerRow>((from, to) =>
      db
        .from("ledger_entries")
        .select(
          `entry_date, created_at, source_type, source_id, description, debit_amount, credit_amount, ${column}`,
        )
        .in(column, ids2)
        .eq("voided", false)
        .order("entry_date")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
    all.push(...rows);
  }
  return all;
}

/**
 * Compute the still-open (unpaid) amount for each team-expense share, keyed by
 * team_expense_share id. Mirrors {@link computeBookingShareRemaining}: it finds
 * the wallet each share was actually charged to (reading the ledger directly, so
 * group-pooling is handled correctly), then FIFO-applies each wallet's credits
 * and payments across all its charges. A share id absent from the map (or ≈0)
 * is fully settled. Used by the Team Expenses list to flag settled vs. due.
 */
export async function computeExpenseShareRemaining(
  db: SupabaseClient,
  shareIds: string[],
): Promise<Map<string, number>> {
  const remainingByShare = new Map<string, number>();
  if (shareIds.length === 0) return remainingByShare;

  // Find which wallet each expense share was charged to (the debit rows).
  const chargeRows: { player_id: string | null; player_group_id: string | null }[] =
    [];
  for (const ids2 of chunk(shareIds, 200)) {
    const rows = await fetchAllRows<{
      player_id: string | null;
      player_group_id: string | null;
    }>((from, to) =>
      db
        .from("ledger_entries")
        .select("player_id, player_group_id, id")
        .eq("source_type", "team_expense_share")
        .eq("voided", false)
        .gt("debit_amount", 0)
        .in("source_id", ids2)
        .order("id")
        .range(from, to),
    );
    chargeRows.push(...rows);
  }

  const walletPIds = new Set<string>();
  const walletGIds = new Set<string>();
  for (const r of chargeRows) {
    if (r.player_group_id) walletGIds.add(r.player_group_id);
    else if (r.player_id) walletPIds.add(r.player_id);
  }
  if (walletPIds.size === 0 && walletGIds.size === 0) return remainingByShare;

  // Load full non-voided ledgers for those wallets (fully paginated).
  const [pLedger, gLedger] = await Promise.all([
    fetchLedgerByOwners(db, "player_id", [...walletPIds]),
    fetchLedgerByOwners(db, "player_group_id", [...walletGIds]),
  ]);

  const walletEntries = new Map<string, LedgerRow[]>();
  for (const row of pLedger as (LedgerRow & { player_id: string })[]) {
    const key = `p:${row.player_id}`;
    const list = walletEntries.get(key) ?? [];
    list.push(row);
    walletEntries.set(key, list);
  }
  for (const row of gLedger as (LedgerRow & {
    player_group_id: string;
  })[]) {
    const key = `g:${row.player_group_id}`;
    const list = walletEntries.get(key) ?? [];
    list.push(row);
    walletEntries.set(key, list);
  }

  const wanted = new Set(shareIds);
  const chargesByWallet = batchComputePlayerOpenCharges(walletEntries);
  for (const charges of chargesByWallet.values()) {
    for (const c of charges) {
      if (c.source_type === "team_expense_share" && wanted.has(c.source_id))
        remainingByShare.set(c.source_id, c.remaining);
    }
  }
  return remainingByShare;
}

export { planBulkAllocation, totalOpenDue } from "@/lib/payment-allocation-plan";
export type { AllocationLine } from "@/lib/payment-allocation-plan";
