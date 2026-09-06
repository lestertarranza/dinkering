"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { nextCode, resolveWalletOwner } from "@/lib/ledger";
import { formatMoney } from "@/lib/format";
import { logAdminAction } from "@/lib/activity-log";

export async function updateGcashNumber(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gcash_number = String(formData.get("gcash_number") || "").trim() || null;
  const { supabase } = await requireAdmin();
  await supabase
    .from("app_settings")
    .update({ gcash_number })
    .eq("id", true);
  revalidatePath("/admin/collections");
  return actionOk(
    gcash_number
      ? "GCash number saved — it will appear in payment reminders."
      : "GCash number cleared.",
  );
}

export async function updateBankTransfer(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const bank_transfer_details =
    String(formData.get("bank_transfer_details") || "").trim() || null;
  const { supabase } = await requireAdmin();
  await supabase
    .from("app_settings")
    .update({ bank_transfer_details })
    .eq("id", true);
  revalidatePath("/admin/collections");
  return actionOk(
    bank_transfer_details
      ? "Bank transfer details saved — they will appear in payment reminders."
      : "Bank transfer details cleared.",
  );
}

export async function markContacted(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner_kind = String(formData.get("owner_kind") || "");
  const owner_id = String(formData.get("owner_id") || "");
  if (owner_kind !== "player" && owner_kind !== "group") {
    return actionErr("Invalid owner.");
  }
  if (!owner_id) return actionErr("Missing player.");
  const { supabase } = await requireAdmin();
  await supabase.from("collection_contacts").upsert({
    owner_kind,
    owner_id,
    contacted_at: new Date().toISOString(),
  });
  revalidatePath("/admin/collections");
  return actionOk("Marked as contacted.");
}

export async function rejectPaymentProof(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const { supabase, user } = await requireAdmin();
  await supabase
    .from("payment_proofs")
    .update({ status: "rejected" })
    .eq("id", id);
  await logAdminAction(supabase, user, {
    entityType: "payment",
    entityId: id,
    action: "Rejected payment proof",
  });
  revalidatePath("/admin/collections");
  return actionOk("Proof rejected.");
}

export async function confirmPaymentProof(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const amount = Math.abs(parseFloat(String(formData.get("amount") || "0")));
  if (!id || !amount) return actionErr("Amount is required.");
  const { supabase, user } = await requireAdmin();
  const { data: proof } = await supabase
    .from("payment_proofs")
    .select("*")
    .eq("id", id)
    .single();
  if (!proof) return actionErr("Proof not found.");
  const payment_date = new Date().toISOString().slice(0, 10);
  const player_id = proof.player_id as string | null;
  const group_id = proof.player_group_id as string | null;
  const wallet = group_id
    ? { player_id: null, player_group_id: group_id }
    : player_id
      ? await resolveWalletOwner(supabase, player_id, payment_date)
      : null;
  if (!wallet) return actionErr("Could not resolve wallet.");
  const code = await nextCode(supabase, "payments", "payment_code", "PAY");
  const { data: pay, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_code: code,
      payment_date,
      payer_player_id: player_id,
      payer_group_id: group_id,
      amount,
      payment_method: "transfer",
      reference_number: proof.reference_number,
      notes: "Confirmed from player payment proof",
    })
    .select("id")
    .single();
  if (payErr || !pay?.id) return actionErr(payErr?.message ?? "Could not record payment.");
  await supabase.from("ledger_entries").insert({
    entry_date: payment_date,
    player_id: wallet.player_id,
    player_group_id: wallet.player_group_id,
    source_type: "payment",
    source_id: pay.id,
    description: `Payment ${code} (player proof)`,
    debit_amount: 0,
    credit_amount: amount,
  });
  await supabase
    .from("payment_proofs")
    .update({ status: "confirmed" })
    .eq("id", id);
  await logAdminAction(supabase, user, {
    entityType: "payment",
    entityId: pay.id,
    action: `Confirmed payment proof ${code}`,
    details: formatMoney(amount),
  });
  revalidatePath("/admin/collections");
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  return actionOk(`Recorded ${formatMoney(amount)} — ${code}.`);
}

