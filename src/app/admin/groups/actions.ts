"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { GroupType } from "@/lib/types";

export async function createGroup(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const type = String(formData.get("type") || "couple") as GroupType;
  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("player_groups")
    .insert({ name, type, notes })
    .select("id")
    .single();

  // Optionally attach selected players immediately
  const memberIds = formData.getAll("member_ids").map(String).filter(Boolean);
  if (data?.id && memberIds.length) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("player_group_members").insert(
      memberIds.map((player_id, i) => ({
        player_group_id: data.id,
        player_id,
        is_primary: i === 0,
        start_date: today,
      })),
    );
  }
  revalidatePath("/admin/groups");
}

export async function updateGroup(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "couple") as GroupType;
  const notes = String(formData.get("notes") || "").trim() || null;

  const supabase = await createClient();
  await supabase
    .from("player_groups")
    .update({ name, type, notes })
    .eq("id", id);
  revalidatePath(`/admin/groups/${id}`);
  revalidatePath("/admin/groups");
}

export async function addMember(formData: FormData) {
  const player_group_id = String(formData.get("player_group_id"));
  const player_id = String(formData.get("player_id"));
  const is_primary = formData.get("is_primary") === "on";
  if (!player_id) return;
  const supabase = await createClient();
  await supabase.from("player_group_members").insert({
    player_group_id,
    player_id,
    is_primary,
    start_date: new Date().toISOString().slice(0, 10),
  });
  revalidatePath(`/admin/groups/${player_group_id}`);
}

export async function removeMember(formData: FormData) {
  const membership_id = String(formData.get("membership_id"));
  const player_group_id = String(formData.get("player_group_id"));
  const supabase = await createClient();
  await supabase
    .from("player_group_members")
    .update({ end_date: new Date().toISOString().slice(0, 10) })
    .eq("id", membership_id);
  revalidatePath(`/admin/groups/${player_group_id}`);
}

export async function regenerateGroupToken(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await supabase
    .from("player_groups")
    .update({ public_token: token })
    .eq("id", id);
  revalidatePath(`/admin/groups/${id}`);
}

export async function deleteGroup(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { count } = await supabase
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("player_group_id", id);
  if (count && count > 0) return; // keep audit trail; do not delete funded groups
  await supabase.from("player_groups").delete().eq("id", id);
  revalidatePath("/admin/groups");
  redirect("/admin/groups");
}
