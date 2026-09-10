import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/ledger";
import { fetchAllRows, chunk } from "@/lib/paginate";
import { computeClubFundShareRemaining } from "@/lib/payment-allocation";
import {
  withFundCashAvailable,
  type ClubFundCashParts,
} from "@/lib/club-funds";

export type ClubFundCashSummary = ClubFundCashParts & { available: number };

export type ClubFundEntryCash = {
  billed: number;
  collected: number;
  unpaid: number;
};

export type ClubFundShareAudit = {
  shareId: string;
  playerId: string;
  playerName: string;
  amount: number;
  paid: number;
  remaining: number;
  entryId: string;
  bookingId: string | null;
  bookingCode: string | null;
  playDate: string | null;
};

type EntryRow = {
  id: string;
  fund_id: string;
  kind: string;
  amount: number;
  voided: boolean;
  booking_id: string | null;
};

type ShareRow = {
  id: string;
  fund_entry_id: string;
  player_id: string;
  amount_owed: number;
  players: { name: string } | null;
};

function settledOf(amount: number, remaining: number | undefined): number {
  const open =
    remaining === undefined ? 0 : Math.min(amount, Math.max(0, remaining));
  return round2(amount - open);
}

function remainingOf(amount: number, remaining: number | undefined): number {
  if (remaining === undefined) return 0;
  return round2(Math.min(amount, Math.max(0, remaining)));
}

async function loadEntries(
  db: SupabaseClient,
  fundIds?: string[],
): Promise<EntryRow[]> {
  const ids = fundIds?.filter(Boolean) ?? [];
  if (fundIds && ids.length === 0) return [];

  if (ids.length === 0) {
    return fetchAllRows<EntryRow>((from, to) =>
      db
        .from("club_fund_entries")
        .select("id, fund_id, kind, amount, voided, booking_id")
        .order("id")
        .range(from, to),
    );
  }

  const all: EntryRow[] = [];
  for (const batch of chunk(ids, 200)) {
    const rows = await fetchAllRows<EntryRow>((from, to) =>
      db
        .from("club_fund_entries")
        .select("id, fund_id, kind, amount, voided, booking_id")
        .in("fund_id", batch)
        .order("id")
        .range(from, to),
    );
    all.push(...rows);
  }
  return all;
}

async function loadShares(
  db: SupabaseClient,
  entryIds: string[],
): Promise<ShareRow[]> {
  if (entryIds.length === 0) return [];
  const all: ShareRow[] = [];
  for (const batch of chunk(entryIds, 200)) {
    const rows = await fetchAllRows<ShareRow>((from, to) =>
      db
        .from("club_fund_shares")
        .select("id, fund_entry_id, player_id, amount_owed, players(name)")
        .in("fund_entry_id", batch)
        .order("id")
        .range(from, to),
    );
    all.push(...rows);
  }
  return all;
}

/**
 * Cash-basis totals per club item pot. Game contribution allocate rows are
 * billed, not collected. Collected follows wallet FIFO on those shares.
 */
export async function loadClubFundCashSummaries(
  db: SupabaseClient,
  fundIds?: string[],
): Promise<{
  byFund: Map<string, ClubFundCashSummary>;
  byEntry: Map<string, ClubFundEntryCash>;
}> {
  const byFund = new Map<string, ClubFundCashSummary>();
  const byEntry = new Map<string, ClubFundEntryCash>();

  const entries = await loadEntries(db, fundIds);
  const billedEntryIds = entries
    .filter((e) => !e.voided && e.kind === "allocate" && e.booking_id)
    .map((e) => e.id);
  const shares = await loadShares(db, billedEntryIds);
  const remainingByShare = await computeClubFundShareRemaining(
    db,
    shares.map((s) => s.id),
  );

  const billedByFund = new Map<string, number>();
  const unpaidByFund = new Map<string, number>();
  const billedByEntry = new Map<string, number>();
  const unpaidByEntry = new Map<string, number>();

  const fundIdByEntry = new Map(entries.map((e) => [e.id, e.fund_id]));

  for (const s of shares) {
    const amount = Number(s.amount_owed);
    if (!Number.isFinite(amount)) continue;
    const unpaid = remainingOf(amount, remainingByShare.get(s.id));
    const fundId = fundIdByEntry.get(s.fund_entry_id);
    if (!fundId) continue;
    billedByFund.set(fundId, round2((billedByFund.get(fundId) ?? 0) + amount));
    unpaidByFund.set(fundId, round2((unpaidByFund.get(fundId) ?? 0) + unpaid));
    billedByEntry.set(
      s.fund_entry_id,
      round2((billedByEntry.get(s.fund_entry_id) ?? 0) + amount),
    );
    unpaidByEntry.set(
      s.fund_entry_id,
      round2((unpaidByEntry.get(s.fund_entry_id) ?? 0) + unpaid),
    );
  }

  for (const [entryId, billed] of billedByEntry) {
    const unpaid = unpaidByEntry.get(entryId) ?? 0;
    byEntry.set(entryId, {
      billed,
      unpaid,
      collected: round2(billed - unpaid),
    });
  }

  const fundIdsSeen = new Set(entries.map((e) => e.fund_id));
  if (fundIds) {
    for (const id of fundIds) fundIdsSeen.add(id);
  }

  for (const fundId of fundIdsSeen) {
    const billed = billedByFund.get(fundId) ?? 0;
    const unpaid = unpaidByFund.get(fundId) ?? 0;
    let manualIn = 0;
    let spent = 0;
    for (const e of entries) {
      if (e.fund_id !== fundId || e.voided) continue;
      const n = Number(e.amount);
      if (!Number.isFinite(n)) continue;
      if (e.kind === "spend") spent = round2(spent + n);
      else if (e.kind === "allocate" && !e.booking_id) {
        manualIn = round2(manualIn + n);
      }
    }
    const parts: ClubFundCashParts = {
      billed,
      unpaid,
      collected: round2(billed - unpaid),
      manualIn,
      spent,
    };
    byFund.set(fundId, withFundCashAvailable(parts));
  }

  return { byFund, byEntry };
}

export async function loadClubFundShareAudit(
  db: SupabaseClient,
  fundId: string,
): Promise<ClubFundShareAudit[]> {
  const entries = await fetchAllRows<
    EntryRow & {
      bookings: { booking_code: string | null; play_date: string } | null;
    }
  >((from, to) =>
    db
      .from("club_fund_entries")
      .select(
        "id, fund_id, kind, amount, voided, booking_id, bookings:booking_id(booking_code, play_date)",
      )
      .eq("fund_id", fundId)
      .eq("kind", "allocate")
      .eq("voided", false)
      .order("id")
      .range(from, to),
  );
  const billedEntries = entries.filter((e) => e.booking_id);

  const shares = await loadShares(
    db,
    billedEntries.map((e) => e.id),
  );
  const remainingByShare = await computeClubFundShareRemaining(
    db,
    shares.map((s) => s.id),
  );
  const entryById = new Map(billedEntries.map((e) => [e.id, e]));

  return shares
    .map((s) => {
      const amount = Number(s.amount_owed);
      const remaining = remainingOf(amount, remainingByShare.get(s.id));
      const entry = entryById.get(s.fund_entry_id);
      return {
        shareId: s.id,
        playerId: s.player_id,
        playerName: s.players?.name ?? "Unknown player",
        amount,
        paid: settledOf(amount, remainingByShare.get(s.id)),
        remaining,
        entryId: s.fund_entry_id,
        bookingId: entry?.booking_id ?? null,
        bookingCode: entry?.bookings?.booking_code ?? null,
        playDate: entry?.bookings?.play_date ?? null,
      };
    })
    .sort((a, b) => {
      if (a.remaining >= 0.005 && b.remaining < 0.005) return -1;
      if (a.remaining < 0.005 && b.remaining >= 0.005) return 1;
      const d = (b.playDate ?? "").localeCompare(a.playDate ?? "");
      if (d !== 0) return d;
      return a.playerName.localeCompare(b.playerName);
    });
}

export async function remainingCashForFund(
  db: SupabaseClient,
  fundId: string,
): Promise<number> {
  const { byFund } = await loadClubFundCashSummaries(db, [fundId]);
  return byFund.get(fundId)?.available ?? 0;
}