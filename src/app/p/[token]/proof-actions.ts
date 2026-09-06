"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPaymentProof } from "@/lib/payment-proof";

export type ProofState = { ok: boolean; message: string } | null;

export async function submitPaymentProof(
  _prev: ProofState,
  formData: FormData,
): Promise<ProofState> {
  const token = String(formData.get("token") || "");
  const file = formData.get("proof") as File | null;
  const amountRaw = String(formData.get("amount") || "").trim();
  const reference = String(formData.get("reference") || "").trim() || null;
  if (!token) return { ok: false, message: "Missing player." };
  if (!file || file.size === 0) return { ok: false, message: "Choose a screenshot." };

  const db = createAdminClient();
  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("public_token", token)
    .single();
  if (!player) return { ok: false, message: "Player not found." };

  const { data: membership } = await db
    .from("player_group_members")
    .select("player_group_id, player_groups(type)")
    .eq("player_id", player.id)
    .is("end_date", null)
    .limit(1)
    .maybeSingle();
  const pooledType = (
    membership as {
      player_group_id: string;
      player_groups: { type: string } | null;
    } | null
  )?.player_groups?.type;
  const groupId =
    pooledType && ["couple", "family", "team_fund"].includes(pooledType)
      ? (membership as { player_group_id: string }).player_group_id
      : null;

  const url = await uploadPaymentProof(file, player.id);
  if (!url) return { ok: false, message: "Could not upload. Try a smaller photo." };

  const amount = amountRaw ? parseFloat(amountRaw) : null;
  const { error } = await db.from("payment_proofs").insert({
    player_id: player.id,
    player_group_id: groupId,
    amount: amount && Number.isFinite(amount) && amount > 0 ? amount : null,
    reference_number: reference,
    image_url: url,
    status: "pending",
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/p/${token}`);
  revalidatePath("/admin/collections");
  return { ok: true, message: "Proof sent. Admin will confirm it." };
}
