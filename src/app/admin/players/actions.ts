"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import { resolveWalletOwner } from "@/lib/ledger";
import type { ActiveStatus, AdjustmentType } from "@/lib/types";

/**
 * Manual adjustment with required reason. Posts a manual_adjustments record
 * plus a matching ledger entry (charge => debit, credit => credit).
 * Works for either a player or a group.
 */
export async function addManualAdjustment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const player_id = (formData.get("player_id") as string) || null;
  const player_group_id = (formData.get("player_group_id") as string) || null;
  const amount = Math.abs(parseFloat(String(formData.get("amount") || "0")));
  const type = String(formData.get("type") || "charge") as AdjustmentType;
  const reason = String(formData.get("reason") || "").trim();
  const date =
    String(formData.get("adjustment_date") || "") ||
    new Date().toISOString().slice(0, 10);

  if (!reason || !amount || (!player_id && !player_group_id)) {
    return actionErr("Enter an amount, reason, and wallet.");
  }

  const { supabase, user } = await requireAdmin();

  const { data: adj } = await supabase
    .from("manual_adjustments")
    .insert({
      player_id,
      player_group_id,
      amount,
      type,
      reason,
      adjustment_date: date,
      created_by: user?.email ?? "admin",
    })
    .select("id")
    .single();

  await supabase.from("ledger_entries").insert({
    entry_date: date,
    player_id,
    player_group_id,
    source_type: "manual_adjustment",
    source_id: adj?.id ?? null,
    description: `Manual ${type}: ${reason}`,
    debit_amount: type === "charge" ? amount : 0,
    credit_amount: type === "credit" ? amount : 0,
  });

  if (player_id) revalidatePath(`/admin/players/${player_id}`);
  if (player_group_id) revalidatePath(`/admin/groups/${player_group_id}`);
  revalidatePath("/admin");
  return actionOk(
    `Recorded ${type} of ${formatMoney(amount)}: ${reason}`,
  );
}

/**
 * Transfer all or selected open charges from one player's wallet to another.
 * Creates a matched pair of manual adjustments:
 *   – credit to the source wallet (removes their debt)
 *   – charge to the target wallet (adds equivalent debt)
 * The items being transferred are embedded in the adjustment notes so the
 * audit trail is preserved on both player ledgers.
 */
export async function transferBalance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sourcePlayerId = String(formData.get("source_player_id") || "");
  const targetPlayerId = String(formData.get("target_player_id") || "");
  const amount = Math.abs(
    parseFloat(String(formData.get("amount") || "0")),
  );
  const itemsJson = String(formData.get("items_json") || "[]");
  const date =
    String(formData.get("transfer_date") || "") ||
    new Date().toISOString().slice(0, 10);
  const extraNotes = String(formData.get("notes") || "").trim();

  if (!sourcePlayerId || !targetPlayerId)
    return actionErr("Select both source and target players.");
  if (sourcePlayerId === targetPlayerId)
    return actionErr("Source and target must be different players.");
  if (!amount || amount <= 0)
    return actionErr("Select at least one charge to transfer.");

  const { supabase, user } = await requireAdmin();

  // Look up player names for descriptions
  const [{ data: src }, { data: tgt }] = await Promise.all([
    supabase.from("players").select("name").eq("id", sourcePlayerId).single(),
    supabase.from("players").select("name").eq("id", targetPlayerId).single(),
  ]);
  if (!src || !tgt) return actionErr("Player not found.");
  const sourceName = src.name as string;
  const targetName = tgt.name as string;

  // Resolve wallets (respects group pooling)
  const [sourceWallet, targetWallet] = await Promise.all([
    resolveWalletOwner(supabase, sourcePlayerId, date),
    resolveWalletOwner(supabase, targetPlayerId, date),
  ]);

  // Build item summary from the JSON payload
  let itemsSummary = "";
  try {
    const items = JSON.parse(itemsJson) as { label: string; amount: number }[];
    itemsSummary = items
      .map((i) => `${i.label} (${formatMoney(i.amount)})`)
      .join("; ");
  } catch {
    itemsSummary = "selected charges";
  }

  const baseDesc = [itemsSummary, extraNotes].filter(Boolean).join(" — ");

  const createdBy = user?.email ?? "admin";

  // 1. Credit the source wallet (removes their debt)
  const { data: creditAdj, error: creditErr } = await supabase
    .from("manual_adjustments")
    .insert({
      player_id: sourceWallet.player_id,
      player_group_id: sourceWallet.player_group_id,
      amount,
      type: "credit",
      reason: `Balance transfer to ${targetName} — ${baseDesc}`,
      adjustment_date: date,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (creditErr || !creditAdj?.id)
    return actionErr("Could not create credit adjustment.");

  await supabase.from("ledger_entries").insert({
    entry_date: date,
    player_id: sourceWallet.player_id,
    player_group_id: sourceWallet.player_group_id,
    source_type: "manual_adjustment",
    source_id: creditAdj.id,
    description: `Transfer to ${targetName} — ${baseDesc}`,
    debit_amount: 0,
    credit_amount: amount,
  });

  // 2. Charge the target wallet (adds equivalent debt)
  const { data: debitAdj, error: debitErr } = await supabase
    .from("manual_adjustments")
    .insert({
      player_id: targetWallet.player_id,
      player_group_id: targetWallet.player_group_id,
      amount,
      type: "charge",
      reason: `Balance transfer from ${sourceName} — ${baseDesc}`,
      adjustment_date: date,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (debitErr || !debitAdj?.id)
    return actionErr(
      "Credit posted but debit failed — check ledgers manually.",
    );

  await supabase.from("ledger_entries").insert({
    entry_date: date,
    player_id: targetWallet.player_id,
    player_group_id: targetWallet.player_group_id,
    source_type: "manual_adjustment",
    source_id: debitAdj.id,
    description: `Transfer from ${sourceName} — ${baseDesc}`,
    debit_amount: amount,
    credit_amount: 0,
  });

  revalidatePath(`/admin/players/${sourcePlayerId}`);
  revalidatePath(`/admin/players/${targetPlayerId}`);
  revalidatePath("/admin");

  return actionOk(
    `Transferred ${formatMoney(amount)} from ${sourceName} to ${targetName}.`,
  );
}

export async function createPlayer(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const display_name = String(formData.get("display_name") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { supabase } = await requireAdmin();
  await supabase.from("players").insert({ name, display_name, notes });
  revalidatePath("/admin/players");
}

export async function updatePlayer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) return actionErr("Name is required.");
  const display_name = String(formData.get("display_name") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const active_status = String(
    formData.get("active_status") || "active",
  ) as ActiveStatus;

  const { supabase } = await requireAdmin();
  await supabase
    .from("players")
    .update({ name, display_name, notes, active_status })
    .eq("id", id);
  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${id}`);
  return actionOk("Player saved.");
}

export async function setPlayerStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const active_status = String(formData.get("active_status")) as ActiveStatus;
  const { supabase } = await requireAdmin();
  await supabase.from("players").update({ active_status }).eq("id", id);
  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${id}`);
  return actionOk(`Player marked ${active_status}.`);
}

export async function regenerateToken(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("gen_share_token");
  const token =
    (data as string | null) ??
    Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  await supabase.from("players").update({ public_token: token }).eq("id", id);
  revalidatePath(`/admin/players/${id}`);
  return actionOk("New player link token generated — old links no longer work.");
}

/** Rotate the public team-board token, invalidating the previous share link. */
export async function regenerateRosterToken(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature
  _prev: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature
  _formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("gen_share_token");
  const token =
    (data as string | null) ??
    Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  await supabase
    .from("app_settings")
    .update({ roster_token: token })
    .eq("id", true);
  revalidatePath("/admin/players");
  return actionOk("Team board & schedule links rotated — share the new URLs.");
}

export async function assignToGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const player_id = String(formData.get("player_id"));
  const player_group_id = String(formData.get("player_group_id"));
  const wantPrimary = formData.get("is_primary") === "on";
  if (!player_group_id) return actionErr("Select a group.");
  const { supabase } = await requireAdmin();

  const { data: existing } = await supabase
    .from("player_group_members")
    .select("id")
    .eq("player_group_id", player_group_id)
    .eq("player_id", player_id)
    .is("end_date", null)
    .limit(1);
  if (existing && existing.length > 0) {
    return actionErr("Player is already in this group.");
  }

  const { count } = await supabase
    .from("player_group_members")
    .select("id", { count: "exact", head: true })
    .eq("player_group_id", player_group_id)
    .is("end_date", null);
  const makePrimary = wantPrimary || (count ?? 0) === 0;

  if (makePrimary) {
    await supabase
      .from("player_group_members")
      .update({ is_primary: false })
      .eq("player_group_id", player_group_id)
      .is("end_date", null);
  }

  await supabase.from("player_group_members").insert({
    player_id,
    player_group_id,
    is_primary: makePrimary,
    start_date: new Date().toISOString().slice(0, 10),
  });
  revalidatePath(`/admin/players/${player_id}`);
  revalidatePath(`/admin/groups/${player_group_id}`);
  return actionOk("Added to group.");
}

export async function removeFromGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membership_id = String(formData.get("membership_id"));
  const player_id = String(formData.get("player_id"));
  const { supabase } = await requireAdmin();
  await supabase
    .from("player_group_members")
    .update({ end_date: new Date().toISOString().slice(0, 10) })
    .eq("id", membership_id);
  revalidatePath(`/admin/players/${player_id}`);
  return actionOk("Removed from group.");
}

export async function deletePlayer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  const { count } = await supabase
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("player_id", id);
  if (count && count > 0) {
    await supabase
      .from("players")
      .update({ active_status: "archived" })
      .eq("id", id);
    revalidatePath("/admin/players");
    redirect("/admin/players");
  }
  await supabase.from("players").delete().eq("id", id);
  revalidatePath("/admin/players");
  redirect("/admin/players");
}
