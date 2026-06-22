"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActiveStatus, AdjustmentType } from "@/lib/types";

/**
 * Manual adjustment with required reason. Posts a manual_adjustments record
 * plus a matching ledger entry (charge => debit, credit => credit).
 * Works for either a player or a group.
 */
export async function addManualAdjustment(formData: FormData) {
  const player_id = (formData.get("player_id") as string) || null;
  const player_group_id = (formData.get("player_group_id") as string) || null;
  const amount = Math.abs(parseFloat(String(formData.get("amount") || "0")));
  const type = String(formData.get("type") || "charge") as AdjustmentType;
  const reason = String(formData.get("reason") || "").trim();
  const date =
    String(formData.get("adjustment_date") || "") ||
    new Date().toISOString().slice(0, 10);

  if (!reason || !amount || (!player_id && !player_group_id)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
}

export async function createPlayer(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const display_name = String(formData.get("display_name") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  await supabase.from("players").insert({ name, display_name, notes });
  revalidatePath("/admin/players");
}

export async function updatePlayer(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const display_name = String(formData.get("display_name") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const active_status = String(
    formData.get("active_status") || "active",
  ) as ActiveStatus;

  const supabase = await createClient();
  await supabase
    .from("players")
    .update({ name, display_name, notes, active_status })
    .eq("id", id);
  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${id}`);
}

export async function setPlayerStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const active_status = String(formData.get("active_status")) as ActiveStatus;
  const supabase = await createClient();
  await supabase.from("players").update({ active_status }).eq("id", id);
  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${id}`);
}

export async function regenerateToken(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data } = await supabase.rpc("gen_share_token");
  // Fallback if rpc not exposed: generate client-side hex.
  const token =
    (data as string | null) ??
    Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  await supabase.from("players").update({ public_token: token }).eq("id", id);
  revalidatePath(`/admin/players/${id}`);
}

export async function assignToGroup(formData: FormData) {
  const player_id = String(formData.get("player_id"));
  const player_group_id = String(formData.get("player_group_id"));
  const wantPrimary = formData.get("is_primary") === "on";
  if (!player_group_id) return;
  const supabase = await createClient();

  // Skip if already an active member of the group.
  const { data: existing } = await supabase
    .from("player_group_members")
    .select("id")
    .eq("player_group_id", player_group_id)
    .eq("player_id", player_id)
    .is("end_date", null)
    .limit(1);
  if (existing && existing.length > 0) {
    revalidatePath(`/admin/players/${player_id}`);
    return;
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
}

export async function removeFromGroup(formData: FormData) {
  const membership_id = String(formData.get("membership_id"));
  const player_id = String(formData.get("player_id"));
  const supabase = await createClient();
  await supabase
    .from("player_group_members")
    .update({ end_date: new Date().toISOString().slice(0, 10) })
    .eq("id", membership_id);
  revalidatePath(`/admin/players/${player_id}`);
}

export async function deletePlayer(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  // Only allow hard delete if the player has no ledger history (financial safety).
  const { count } = await supabase
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("player_id", id);
  if (count && count > 0) {
    // Archive instead of destroying financial history.
    await supabase
      .from("players")
      .update({ active_status: "archived" })
      .eq("id", id);
  } else {
    await supabase.from("players").delete().eq("id", id);
  }
  revalidatePath("/admin/players");
  redirect("/admin/players");
}
