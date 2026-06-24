"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import {
  nextCode,
  voidLedgerForSource,
  resolveWalletOwner,
} from "@/lib/ledger";
import { rebuildExpenseSharesAtomic } from "@/lib/ledger-rpc";
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
 * (Re)build all shares + ledger entries for an expense via atomic RPC.
 */
async function rebuildExpenseShares(
  db: SupabaseClient,
  expense: TeamExpense,
  rows: ShareRow[],
) {
  await rebuildExpenseSharesAtomic(db, expense, rows);
}

export async function createExpense(formData: FormData) {
  const { supabase } = await requireAdmin();
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

export async function regenerateExpenseShares(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const expense_id = String(formData.get("expense_id"));
  const { supabase } = await requireAdmin();
  const { data: expense } = await supabase
    .from("team_expenses")
    .select("*")
    .eq("id", expense_id)
    .single();
  if (!expense) return actionErr("Expense not found.");

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

  if (rows.length === 0) {
    return actionErr("Select at least one player to include in the split.");
  }

  try {
    await rebuildExpenseShares(supabase, expense as TeamExpense, rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not regenerate split.";
    return actionErr(msg);
  }

  revalidatePath(`/admin/expenses/${expense_id}`);
  revalidatePath("/admin");
  return actionOk(
    `Split regenerated for ${rows.length} player${rows.length === 1 ? "" : "s"} (${formatMoney(expense.total_cost)} total).`,
  );
}

export async function reverseExpense(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
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
  revalidatePath("/admin");
  return actionOk("Expense reversed — shares and buyer credit voided.");
}

export async function deleteExpense(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  const { data: shares } = await supabase
    .from("team_expense_shares")
    .select("id")
    .eq("team_expense_id", id);
  if ((shares ?? []).length > 0) {
    const result = await reverseExpense(null, formData);
    return actionOk(
      `${result?.message ?? "Expense reversed."} It had shares, so it was reversed instead of deleted.`,
    );
  }
  await supabase.from("team_expenses").delete().eq("id", id);
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses");
}

/**
 * Quick "mark as paid" directly from the expense detail page.
 * Records a payment for the outstanding share amount for a specific player
 * (or group), tagged to this team expense. Respects group wallet routing.
 */
export async function markExpenseSharePaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const expense_id = String(formData.get("expense_id") || "");
  const player_id = String(formData.get("player_id") || "") || null;
  const player_group_id =
    String(formData.get("player_group_id") || "") || null;
  const amount = Math.abs(
    parseFloat(String(formData.get("amount") || "0")),
  );
  const payment_date =
    String(formData.get("payment_date") || "") ||
    new Date().toISOString().slice(0, 10);

  if (!expense_id || !amount || (!player_id && !player_group_id))
    return actionErr("Missing required fields.");

  const { supabase } = await requireAdmin();

  // Resolve the wallet — respect group pooling for players.
  const wallet = player_group_id
    ? { player_id: null, player_group_id }
    : await resolveWalletOwner(supabase, player_id!, payment_date);

  const code = await nextCode(supabase, "payments", "payment_code", "PAY");

  const { data: pay, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_code: code,
      payment_date,
      payer_player_id: player_id,
      payer_group_id: player_group_id,
      team_expense_id: expense_id,
      amount,
      notes: "Marked as paid from expense page",
    })
    .select("id")
    .single();

  if (payErr || !pay?.id)
    return actionErr(payErr?.message ?? "Could not record payment.");

  await supabase.from("ledger_entries").insert({
    entry_date: payment_date,
    player_id: wallet.player_id,
    player_group_id: wallet.player_group_id,
    source_type: "payment",
    source_id: pay.id,
    description: `Payment ${code} (team expense)`,
    debit_amount: 0,
    credit_amount: amount,
  });

  revalidatePath(`/admin/expenses/${expense_id}`);
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  return actionOk(`Recorded ${formatMoney(amount)} — ${code}.`);
}
