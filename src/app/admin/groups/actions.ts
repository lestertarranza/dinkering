"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { round2 } from "@/lib/ledger";
import { SETTLE_TOLERANCE } from "@/lib/format";
import type { GroupType } from "@/lib/types";

export async function createGroup(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const type = String(formData.get("type") || "couple") as GroupType;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("player_groups")
    .insert({ name, type, notes })
    .select("id")
    .single();

  // Optionally attach selected players immediately (deduped; first is primary)
  const memberIds = [
    ...new Set(formData.getAll("member_ids").map(String).filter(Boolean)),
  ];
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

export async function updateGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) return actionErr("Name is required.");
  const type = String(formData.get("type") || "couple") as GroupType;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { supabase } = await requireAdmin();
  await supabase
    .from("player_groups")
    .update({ name, type, notes })
    .eq("id", id);
  revalidatePath(`/admin/groups/${id}`);
  revalidatePath("/admin/groups");
  return actionOk("Group saved.");
}

export async function addMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const player_group_id = String(formData.get("player_group_id"));
  const player_id = String(formData.get("player_id"));
  const wantPrimary = formData.get("is_primary") === "on";
  if (!player_id) return actionErr("Select a player.");
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
    player_group_id,
    player_id,
    is_primary: makePrimary,
    start_date: new Date().toISOString().slice(0, 10),
  });
  revalidatePath(`/admin/groups/${player_group_id}`);
  return actionOk("Member added.");
}

/** Designate an existing active member as the group's sole primary. */
export async function setPrimaryMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membership_id = String(formData.get("membership_id"));
  const player_group_id = String(formData.get("player_group_id"));
  const { supabase } = await requireAdmin();
  await supabase
    .from("player_group_members")
    .update({ is_primary: false })
    .eq("player_group_id", player_group_id)
    .is("end_date", null);
  await supabase
    .from("player_group_members")
    .update({ is_primary: true })
    .eq("id", membership_id);
  revalidatePath(`/admin/groups/${player_group_id}`);
  return actionOk("Primary member updated.");
}

export async function removeMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membership_id = String(formData.get("membership_id"));
  const player_group_id = String(formData.get("player_group_id"));
  const { supabase } = await requireAdmin();
  await supabase
    .from("player_group_members")
    .update({ end_date: new Date().toISOString().slice(0, 10) })
    .eq("id", membership_id);
  revalidatePath(`/admin/groups/${player_group_id}`);
  return actionOk("Member removed from group.");
}

/**
 * Pull each active member's current individual balance into the group's
 * pooled wallet. Posts a balanced pair of manual adjustments per member:
 * one that zeroes the player and one that loads the same net onto the group,
 * preserving a full audit trail (no history is rewritten or deleted).
 */
export async function pullMemberBalances(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const player_group_id = String(formData.get("player_group_id"));
  if (!player_group_id) return actionErr("Missing group.");
  const { supabase, user } = await requireAdmin();
  const actor = user.email ?? "admin";
  const today = new Date().toISOString().slice(0, 10);

  const { data: group } = await supabase
    .from("player_groups")
    .select("name")
    .eq("id", player_group_id)
    .single();
  if (!group) return actionErr("Group not found.");

  const { data: members } = await supabase
    .from("player_group_members")
    .select("player_id, players(name)")
    .eq("player_group_id", player_group_id)
    .is("end_date", null);

  let pulled = 0;
  for (const m of (members ?? []) as unknown as {
    player_id: string;
    players: { name: string } | null;
  }[]) {
    const { data: bal } = await supabase
      .from("player_balances")
      .select("balance")
      .eq("player_id", m.player_id)
      .single();
    const balance = round2(Number(bal?.balance ?? 0));
    if (Math.abs(balance) < SETTLE_TOLERANCE) continue;

    pulled += 1;
    const magnitude = round2(Math.abs(balance));
    const owes = balance > 0; // positive balance => player owes the team
    const playerName = m.players?.name ?? "member";

    // Player side: offset their balance back to zero.
    const { data: playerAdj } = await supabase
      .from("manual_adjustments")
      .insert({
        player_id: m.player_id,
        amount: magnitude,
        type: owes ? "credit" : "charge",
        reason: `Transferred balance to pooled group "${group.name}"`,
        adjustment_date: today,
        created_by: actor,
      })
      .select("id")
      .single();

    await supabase.from("ledger_entries").insert({
      entry_date: today,
      player_id: m.player_id,
      player_group_id: null,
      source_type: "manual_adjustment",
      source_id: playerAdj?.id ?? null,
      description: `Transferred balance to pooled group "${group.name}"`,
      debit_amount: owes ? 0 : magnitude,
      credit_amount: owes ? magnitude : 0,
    });

    // Group side: load the same net onto the pooled wallet.
    const { data: groupAdj } = await supabase
      .from("manual_adjustments")
      .insert({
        player_group_id,
        amount: magnitude,
        type: owes ? "charge" : "credit",
        reason: `Pulled opening balance from ${playerName}`,
        adjustment_date: today,
        created_by: actor,
      })
      .select("id")
      .single();

    await supabase.from("ledger_entries").insert({
      entry_date: today,
      player_id: null,
      player_group_id,
      source_type: "manual_adjustment",
      source_id: groupAdj?.id ?? null,
      description: `Opening balance pulled from ${playerName}`,
      debit_amount: owes ? magnitude : 0,
      credit_amount: owes ? 0 : magnitude,
    });

    revalidatePath(`/admin/players/${m.player_id}`);
  }

  revalidatePath(`/admin/groups/${player_group_id}`);
  revalidatePath("/admin");
  if (pulled === 0) {
    return actionOk("No individual balances to pull — members are already at zero.");
  }
  return actionOk(
    `Pulled balances from ${pulled} member${pulled === 1 ? "" : "s"} into the group wallet.`,
  );
}

export async function regenerateGroupToken(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await supabase
    .from("player_groups")
    .update({ public_token: token })
    .eq("id", id);
  revalidatePath(`/admin/groups/${id}`);
  return actionOk("New group link token generated.");
}

export async function deleteGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  const { count } = await supabase
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("player_group_id", id);
  if (count && count > 0) {
    return actionErr(
      "Cannot delete — this group has ledger history. Remove members or leave it as-is.",
    );
  }
  await supabase.from("player_groups").delete().eq("id", id);
  revalidatePath("/admin/groups");
  redirect("/admin/groups");
}
