"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  nextCode,
  resolveWalletOwner,
  voidLedgerForSource,
  splitByUnits,
} from "@/lib/ledger";
import type { SplitMethod, TeamExpense } from "@/lib/types";

const chargeable = new Set(["attended", "late_cancel", "guest"]);

/** Resolve the participating player ids for a split method. */
async function resolveParticipants(
  db: SupabaseClient,
  method: SplitMethod,
  purchaseDate: string,
  selectedIds: string[],
  bookingId: string | null,
): Promise<string[]> {
  if (method === "active_players") {
    const { data } = await db
      .from("players")
      .select("id")
      .eq("active_status", "active");
    return (data ?? []).map((p) => p.id as string);
  }
  if (method === "attendees" && bookingId) {
    const { data } = await db
      .from("booking_attendance")
      .select("player_id, actual_status, response_status")
      .eq("booking_id", bookingId);
    return (data ?? [])
      .filter((a) =>
        a.actual_status
          ? chargeable.has(a.actual_status as string)
          : a.response_status === "going",
      )
      .map((a) => a.player_id as string);
  }
  // selected_players / custom
  return selectedIds;
}

interface ShareRow {
  player_id: string;
  share_units: number;
  override_share_amount: number | null;
}

/**
 * (Re)build all shares + ledger entries for an expense:
 *  - voids prior expense_share and team_expense_credit ledger entries
 *  - deletes prior share rows
 *  - splits total cost across participants by units
 *  - credits the buyer for the full amount
 */
async function rebuildExpenseShares(
  db: SupabaseClient,
  expense: TeamExpense,
  rows: ShareRow[],
) {
  const { data: existing } = await db
    .from("team_expense_shares")
    .select("id")
    .eq("team_expense_id", expense.id);
  for (const s of existing ?? []) {
    await voidLedgerForSource(db, "team_expense_share", s.id as string);
  }
  await voidLedgerForSource(db, "team_expense_credit", expense.id);
  await db.from("team_expense_shares").delete().eq("team_expense_id", expense.id);

  // Buyer reimbursement credit (full amount paid).
  let creditPlayer = expense.paid_by_player_id;
  let creditGroup = expense.paid_by_group_id;
  if (expense.paid_by_player_id) {
    const owner = await resolveWalletOwner(
      db,
      expense.paid_by_player_id,
      expense.purchase_date,
    );
    creditPlayer = owner.player_id;
    creditGroup = owner.player_group_id;
  }
  if (creditPlayer || creditGroup) {
    await db.from("ledger_entries").insert({
      entry_date: expense.purchase_date,
      player_id: creditPlayer,
      player_group_id: creditGroup,
      source_type: "team_expense_credit",
      source_id: expense.id,
      description: `Reimbursement — ${expense.expense_code ?? expense.description}`,
      debit_amount: 0,
      credit_amount: Number(expense.total_cost),
    });
  }

  if (rows.length === 0) return;
  const allocations = splitByUnits(rows, Number(expense.total_cost));

  for (const { row, amount } of allocations) {
    const owner = await resolveWalletOwner(
      db,
      row.player_id,
      expense.purchase_date,
    );
    const { data: share } = await db
      .from("team_expense_shares")
      .insert({
        team_expense_id: expense.id,
        player_id: row.player_id,
        player_group_id: owner.player_group_id,
        share_units: row.share_units,
        override_share_amount: row.override_share_amount,
        amount_owed: amount,
      })
      .select("id")
      .single();
    if (share?.id) {
      await db.from("ledger_entries").insert({
        entry_date: expense.purchase_date,
        player_id: owner.player_id,
        player_group_id: owner.player_group_id,
        source_type: "team_expense_share",
        source_id: share.id,
        description: `Expense share — ${
          expense.expense_code ?? expense.description
        }`,
        debit_amount: amount,
        credit_amount: 0,
      });
    }
  }
}

export async function createExpense(formData: FormData) {
  const supabase = await createClient();
  const purchase_date =
    String(formData.get("purchase_date") || "") ||
    new Date().toISOString().slice(0, 10);
  const payer = String(formData.get("payer") || "");
  const paid_by_player_id = payer.startsWith("p:") ? payer.slice(2) : null;
  const paid_by_group_id = payer.startsWith("g:") ? payer.slice(2) : null;
  const split_method = String(
    formData.get("split_method") || "active_players",
  ) as SplitMethod;
  const total_cost = Math.abs(parseFloat(String(formData.get("total_cost") || "0")));
  const booking_id = String(formData.get("booking_id") || "") || null;
  const selectedIds = formData.getAll("selected_players").map(String);

  const code =
    String(formData.get("expense_code") || "").trim() ||
    (await nextCode(supabase, "team_expenses", "expense_code", "EXP"));

  const { data: expenseRow } = await supabase
    .from("team_expenses")
    .insert({
      expense_code: code,
      purchase_date,
      description: String(formData.get("description") || "").trim() || "Team item",
      paid_by_player_id,
      paid_by_group_id,
      total_cost,
      split_method,
      status: "open",
      notes: String(formData.get("notes") || "").trim() || null,
    })
    .select("*")
    .single();

  if (expenseRow) {
    const participants = await resolveParticipants(
      supabase,
      split_method,
      purchase_date,
      selectedIds,
      booking_id,
    );
    // Include the buyer in the split by default (if buyer is a player).
    const set = new Set(participants);
    if (paid_by_player_id) set.add(paid_by_player_id);
    const rows: ShareRow[] = [...set].map((player_id) => ({
      player_id,
      share_units: 1,
      override_share_amount: null,
    }));
    await rebuildExpenseShares(supabase, expenseRow as TeamExpense, rows);
  }

  revalidatePath("/admin/expenses");
  revalidatePath("/admin");
  if (expenseRow?.id) redirect(`/admin/expenses/${expenseRow.id}`);
}

export async function regenerateExpenseShares(formData: FormData) {
  const expense_id = String(formData.get("expense_id"));
  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("team_expenses")
    .select("*")
    .eq("id", expense_id)
    .single();
  if (!expense) return;

  const rows: ShareRow[] = formData
    .getAll("share_player_ids")
    .map(String)
    .filter((pid) => formData.get(`include-${pid}`) === "on")
    .map((pid) => {
      const overrideRaw = String(formData.get(`override-${pid}`) || "").trim();
      return {
        player_id: pid,
        share_units: parseFloat(String(formData.get(`units-${pid}`) || "1")) || 0,
        override_share_amount: overrideRaw === "" ? null : parseFloat(overrideRaw),
      };
    });

  await rebuildExpenseShares(supabase, expense as TeamExpense, rows);
  revalidatePath(`/admin/expenses/${expense_id}`);
}

export async function reverseExpense(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: shares } = await supabase
    .from("team_expense_shares")
    .select("id")
    .eq("team_expense_id", id);
  for (const s of shares ?? []) {
    await voidLedgerForSource(supabase, "team_expense_share", s.id as string);
  }
  await voidLedgerForSource(supabase, "team_expense_credit", id);
  await supabase
    .from("team_expenses")
    .update({ status: "reversed" })
    .eq("id", id);
  revalidatePath(`/admin/expenses/${id}`);
  revalidatePath("/admin/expenses");
}

export async function deleteExpense(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: shares } = await supabase
    .from("team_expense_shares")
    .select("id")
    .eq("team_expense_id", id);
  if ((shares ?? []).length > 0) {
    // keep history: reverse instead
    await reverseExpense(formData);
    return;
  }
  await supabase.from("team_expenses").delete().eq("id", id);
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses");
}
