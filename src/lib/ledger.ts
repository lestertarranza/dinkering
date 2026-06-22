import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceType } from "./types";

type DB = SupabaseClient;

/** Generate the next sequential code like "PB-001" for a table/column. */
export async function nextCode(
  db: DB,
  table: string,
  column: string,
  prefix: string,
  pad = 3,
): Promise<string> {
  const { data } = await db
    .from(table)
    .select(column)
    .ilike(column, `${prefix}-%`)
    .order(column, { ascending: false })
    .limit(1);

  let next = 1;
  const latest = data?.[0]?.[column as keyof (typeof data)[number]] as
    | string
    | undefined;
  if (latest) {
    const num = parseInt(latest.split("-").pop() || "0", 10);
    if (Number.isFinite(num)) next = num + 1;
  }
  return `${prefix}-${String(next).padStart(pad, "0")}`;
}

export interface WalletOwner {
  player_id: string | null;
  player_group_id: string | null;
}

/**
 * Resolve which wallet a player's charges/payments belong to.
 * If the player belongs to an active pooled group (couple/family/team_fund)
 * on the given date, charges route to that group's wallet. Otherwise the
 * player owns their own wallet.
 */
export async function resolveWalletOwner(
  db: DB,
  playerId: string,
  onDate: string,
): Promise<WalletOwner> {
  const { data } = await db
    .from("player_group_members")
    .select("player_group_id, is_primary, start_date, end_date, player_groups!inner(type)")
    .eq("player_id", playerId)
    .in("player_groups.type", ["couple", "family", "team_fund"]);

  const active = (data ?? []).filter((m: Record<string, unknown>) => {
    const start = m.start_date as string | null;
    const end = m.end_date as string | null;
    return (!start || start <= onDate) && (!end || end >= onDate);
  });

  if (active.length > 0) {
    active.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    return {
      player_id: null,
      player_group_id: active[0].player_group_id as string,
    };
  }
  return { player_id: playerId, player_group_id: null };
}

/** Void (not delete) all ledger entries originating from a given source. */
export async function voidLedgerForSource(
  db: DB,
  sourceType: SourceType,
  sourceId: string,
) {
  await db
    .from("ledger_entries")
    .update({ voided: true })
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("voided", false);
}

export interface LedgerEntryInput {
  entry_date: string;
  player_id: string | null;
  player_group_id: string | null;
  source_type: SourceType;
  source_id: string;
  description: string;
  debit_amount?: number;
  credit_amount?: number;
}

export async function postLedgerEntries(db: DB, entries: LedgerEntryInput[]) {
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    entry_date: e.entry_date,
    player_id: e.player_id,
    player_group_id: e.player_group_id,
    source_type: e.source_type,
    source_id: e.source_id,
    description: e.description,
    debit_amount: e.debit_amount ?? 0,
    credit_amount: e.credit_amount ?? 0,
  }));
  const { error } = await db.from("ledger_entries").insert(rows);
  if (error) throw error;
}

/** Round to 2 decimal places to avoid floating point drift in money math. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Split a total cost across share rows by units, assigning any rounding
 * remainder to the last row so the parts always sum exactly to the total.
 */
export function splitByUnits<T extends { share_units: number; override_share_amount?: number | null }>(
  rows: T[],
  total: number,
): { row: T; amount: number }[] {
  const overridden = rows.filter(
    (r) => r.override_share_amount != null && !Number.isNaN(r.override_share_amount),
  );
  const overrideTotal = overridden.reduce(
    (s, r) => s + Number(r.override_share_amount),
    0,
  );
  const remaining = round2(total - overrideTotal);
  const autoRows = rows.filter(
    (r) => r.override_share_amount == null || Number.isNaN(r.override_share_amount),
  );
  const totalUnits = autoRows.reduce((s, r) => s + Number(r.share_units || 0), 0);

  const result: { row: T; amount: number }[] = [];
  let allocated = 0;
  autoRows.forEach((r, i) => {
    let amt: number;
    if (totalUnits <= 0) {
      amt = 0;
    } else if (i === autoRows.length - 1) {
      amt = round2(remaining - allocated);
    } else {
      amt = round2((remaining * Number(r.share_units)) / totalUnits);
      allocated += amt;
    }
    result.push({ row: r, amount: amt });
  });
  overridden.forEach((r) =>
    result.push({ row: r, amount: round2(Number(r.override_share_amount)) }),
  );
  return result;
}
