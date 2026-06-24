import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerEntry } from "./types";

/**
 * For every "Transfer to/from …" manual_adjustment entry in the list, parse
 * the per-item text, look up the referenced expense details (description,
 * paid-by) from the DB, and return a map of ledger-entry-id → enriched item
 * strings ready for display.  Handles both the old stored format
 * ("Expense — EXP-001 (₱11.84)") and the new format
 * ("Expense (₱11.84) — EXP-001 · Balls · Paid by Jude").
 */
export async function buildTransferItemEnrichment(
  db: SupabaseClient,
  entries: LedgerEntry[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  const transferEntries = entries.filter(
    (e) => e.description?.startsWith("Transfer "),
  );
  if (transferEntries.length === 0) return result;

  // Parse items and collect expense codes that need a lookup.
  const expCodeRe = /\b(EXP-\d+)\b/i;
  const expCodes = new Set<string>();
  for (const e of transferEntries) {
    const desc = e.description ?? "";
    const dashIdx = desc.indexOf(" — ");
    if (dashIdx === -1) continue;
    const rest = desc.slice(dashIdx + 3);
    for (const item of rest.split(";").map((s) => s.trim())) {
      const m = item.match(expCodeRe);
      if (m) expCodes.add(m[1].toUpperCase());
    }
  }

  // Fetch expense details for all referenced codes.
  const expByCode = new Map<
    string,
    { description: string; paidByName: string | null }
  >();
  if (expCodes.size > 0) {
    const { data } = await db
      .from("team_expenses")
      .select(
        "expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name)",
      )
      .in("expense_code", [...expCodes]);
    for (const e of (data ?? []) as unknown as {
      expense_code: string;
      description: string;
      players: { name: string } | null;
      player_groups: { name: string } | null;
    }[]) {
      expByCode.set(e.expense_code.toUpperCase(), {
        description: e.description,
        paidByName: e.players?.name ?? e.player_groups?.name ?? null,
      });
    }
  }

  // Re-format each item with full detail.
  for (const entry of transferEntries) {
    const desc = entry.description ?? "";
    const dashIdx = desc.indexOf(" — ");
    if (dashIdx === -1) continue;
    const rest = desc.slice(dashIdx + 3).trim();
    const rawItems = rest.split(";").map((s) => s.trim()).filter(Boolean);

    const enriched = rawItems.map((item) => {
      // Already enriched (new format): "Expense (₱X) — EXP-001 · Desc · Paid by Y"
      // Detect by "TYPE (₱…) — " pattern.
      if (/^(Expense|Court|Adjustment) \(₱/.test(item)) return item;

      // Old format: "Expense — EXP-001 (₱11.84)"
      const oldMatch = item.match(
        /^(Expense|Court|Adjustment)\s*—\s*([A-Z]+-\d+)[^(]*\((₱[\d,.]+)\)/i,
      );
      if (!oldMatch) return item;

      const [, type, code, amountStr] = oldMatch;
      const expCode = code.toUpperCase();
      const exp = expByCode.get(expCode);

      if (type === "Expense" && exp) {
        const paidLine = exp.paidByName ? ` · Paid by ${exp.paidByName}` : "";
        return `Expense (${amountStr}) — ${expCode} · ${exp.description}${paidLine}`;
      }

      // Court or unresolved: put amount before the dash
      return `${type} (${amountStr}) — ${code}`;
    });

    result.set(entry.id, enriched);
  }

  return result;
}

export type LedgerExpenseCtx = {
  expenseId: string;
  expenseCode: string | null;
  expenseDesc: string;
  paidByName: string | null;
};

/**
 * For every team_expense_share ledger entry in the list, resolve the parent
 * expense details (code, description, who paid it). Returns a map keyed by
 * ledger entry id so callers can look up context in O(1).
 */
export async function buildLedgerExpenseContext(
  db: SupabaseClient,
  entries: LedgerEntry[],
): Promise<Map<string, LedgerExpenseCtx>> {
  const result = new Map<string, LedgerExpenseCtx>();

  const expShareIds = entries
    .filter((e) => e.source_type === "team_expense_share" && e.source_id)
    .map((e) => e.source_id as string);
  if (expShareIds.length === 0) return result;

  const { data: shares } = await db
    .from("team_expense_shares")
    .select(
      "id, team_expense_id, team_expenses(expense_code, description, players:paid_by_player_id(name), player_groups:paid_by_group_id(name))",
    )
    .in("id", expShareIds);

  const shareById = new Map<
    string,
    {
      team_expense_id: string;
      team_expenses: {
        expense_code: string | null;
        description: string;
        players: { name: string } | null;
        player_groups: { name: string } | null;
      } | null;
    }
  >();
  for (const s of (shares ?? []) as unknown as (typeof shareById extends Map<
    string,
    infer V
  >
    ? V & { id: string }
    : never)[]) {
    shareById.set(s.id, s);
  }

  for (const e of entries) {
    if (e.source_type !== "team_expense_share" || !e.source_id) continue;
    const s = shareById.get(e.source_id);
    if (!s) continue;
    const te = s.team_expenses;
    result.set(e.id, {
      expenseId: s.team_expense_id,
      expenseCode: te?.expense_code ?? null,
      expenseDesc: te?.description ?? "Team expense",
      paidByName:
        te?.players?.name ?? te?.player_groups?.name ?? null,
    });
  }
  return result;
}

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
