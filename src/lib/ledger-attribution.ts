import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerEntry } from "./types";

/**
 * Resolve the individual person behind each ledger entry so a pooled group's
 * shared ledger can show who a charge/credit belongs to (e.g. an expense share
 * routed to the group wallet still names the member it was for).
 *
 * Returns a map of ledger entry id → player display name. Entries with no
 * resolvable person (or whose description already names someone) are omitted.
 */
export async function buildLedgerOwnerNames(
  db: SupabaseClient,
  entries: LedgerEntry[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  const idsOf = (type: string) =>
    entries
      .filter((e) => e.source_type === type && e.source_id)
      .map((e) => e.source_id as string);

  const bookingShareIds = idsOf("booking_share");
  const expenseShareIds = idsOf("team_expense_share");
  const paymentIds = idsOf("payment");
  const expenseCreditIds = idsOf("team_expense_credit");

  const [shareRows, expShareRows, payRows, expCreditRows] = await Promise.all([
    bookingShareIds.length
      ? db.from("booking_shares").select("id, player_id").in("id", bookingShareIds)
      : Promise.resolve({ data: [] as unknown[] }),
    expenseShareIds.length
      ? db
          .from("team_expense_shares")
          .select("id, player_id")
          .in("id", expenseShareIds)
      : Promise.resolve({ data: [] as unknown[] }),
    paymentIds.length
      ? db.from("payments").select("id, payer_player_id").in("id", paymentIds)
      : Promise.resolve({ data: [] as unknown[] }),
    expenseCreditIds.length
      ? db
          .from("team_expenses")
          .select("id, paid_by_player_id")
          .in("id", expenseCreditIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // source_id -> player_id
  const sharePlayer = new Map<string, string>();
  for (const r of (shareRows.data ?? []) as {
    id: string;
    player_id: string | null;
  }[]) {
    if (r.player_id) sharePlayer.set(r.id, r.player_id);
  }
  const expSharePlayer = new Map<string, string>();
  for (const r of (expShareRows.data ?? []) as {
    id: string;
    player_id: string | null;
  }[]) {
    if (r.player_id) expSharePlayer.set(r.id, r.player_id);
  }
  const payPlayer = new Map<string, string>();
  for (const r of (payRows.data ?? []) as {
    id: string;
    payer_player_id: string | null;
  }[]) {
    if (r.payer_player_id) payPlayer.set(r.id, r.payer_player_id);
  }
  const creditPlayer = new Map<string, string>();
  for (const r of (expCreditRows.data ?? []) as {
    id: string;
    paid_by_player_id: string | null;
  }[]) {
    if (r.paid_by_player_id) creditPlayer.set(r.id, r.paid_by_player_id);
  }

  // entry id -> player id
  const entryPlayer = new Map<string, string>();
  for (const e of entries) {
    if (!e.source_id) continue;
    let pid: string | undefined;
    if (e.source_type === "booking_share") pid = sharePlayer.get(e.source_id);
    else if (e.source_type === "team_expense_share")
      pid = expSharePlayer.get(e.source_id);
    else if (e.source_type === "payment") pid = payPlayer.get(e.source_id);
    else if (e.source_type === "team_expense_credit")
      pid = creditPlayer.get(e.source_id);
    if (pid) entryPlayer.set(e.id, pid);
  }

  const playerIds = [...new Set(entryPlayer.values())];
  if (playerIds.length === 0) return result;

  const { data: players } = await db
    .from("players")
    .select("id, name, display_name")
    .in("id", playerIds);
  const nameById = new Map<string, string>();
  for (const p of (players ?? []) as {
    id: string;
    name: string;
    display_name: string | null;
  }[]) {
    nameById.set(p.id, p.display_name?.trim() || p.name);
  }

  for (const [entryId, pid] of entryPlayer) {
    const name = nameById.get(pid);
    if (name) result.set(entryId, name);
  }
  return result;
}
