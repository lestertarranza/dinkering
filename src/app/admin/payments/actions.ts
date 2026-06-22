"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  nextCode,
  resolveWalletOwner,
  voidLedgerForSource,
} from "@/lib/ledger";

/** Parse a combined payer value like "p:<uuid>" or "g:<uuid>". */
function parsePayer(value: string): {
  player_id: string | null;
  group_id: string | null;
} {
  if (value.startsWith("g:")) return { player_id: null, group_id: value.slice(2) };
  if (value.startsWith("p:")) return { player_id: value.slice(2), group_id: null };
  return { player_id: null, group_id: null };
}

export async function createPayment(formData: FormData) {
  const { player_id, group_id } = parsePayer(String(formData.get("payer") || ""));
  const amount = Math.abs(parseFloat(String(formData.get("amount") || "0")));
  if (!amount || (!player_id && !group_id)) return;

  const payment_date =
    String(formData.get("payment_date") || "") ||
    new Date().toISOString().slice(0, 10);
  const booking_id = String(formData.get("booking_id") || "") || null;

  const supabase = await createClient();
  const code =
    String(formData.get("payment_code") || "").trim() ||
    (await nextCode(supabase, "payments", "payment_code", "PAY"));

  const { data: payment } = await supabase
    .from("payments")
    .insert({
      payment_code: code,
      payment_date,
      payer_player_id: player_id,
      payer_group_id: group_id,
      booking_id,
      amount,
      payment_method: String(formData.get("payment_method") || "").trim() || null,
      reference_number:
        String(formData.get("reference_number") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
    })
    .select("id")
    .single();

  // Route credit to the wallet owner so pooled members net against the group.
  let ledgerPlayer = player_id;
  let ledgerGroup = group_id;
  if (player_id) {
    const owner = await resolveWalletOwner(supabase, player_id, payment_date);
    ledgerPlayer = owner.player_id;
    ledgerGroup = owner.player_group_id;
  }

  if (payment?.id) {
    await supabase.from("ledger_entries").insert({
      entry_date: payment_date,
      player_id: ledgerPlayer,
      player_group_id: ledgerGroup,
      source_type: "payment",
      source_id: payment.id,
      description: `Payment ${code}${
        booking_id ? " (booking)" : " (advance / general)"
      }`,
      debit_amount: 0,
      credit_amount: amount,
    });
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  if (booking_id) revalidatePath(`/admin/bookings/${booking_id}`);
}

/** Reverse a payment by voiding its ledger entry (audit-safe, no hard delete). */
export async function reversePayment(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await voidLedgerForSource(supabase, "payment", id);
  const { data: pay } = await supabase
    .from("payments")
    .select("notes")
    .eq("id", id)
    .single();
  await supabase
    .from("payments")
    .update({
      notes: `[REVERSED ${new Date().toISOString().slice(0, 10)}] ${
        pay?.notes ?? ""
      }`.trim(),
    })
    .eq("id", id);
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
}
