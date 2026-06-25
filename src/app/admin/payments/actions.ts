"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { actionOk, type ActionState } from "@/lib/action-state";
import {
  nextCode,
  resolveWalletOwner,
  voidLedgerForSource,
} from "@/lib/ledger";
import {
  getOpenCharges,
  planBulkAllocation,
  totalOpenDue,
  type OpenCharge,
} from "@/lib/payment-allocation";
import { formatMoney } from "@/lib/format";

export type PaymentState = { ok: boolean; message: string } | null;

export type BulkPreview = {
  charges: OpenCharge[];
  totalOwed: number;
};

/** Parse a combined payer value like "p:<uuid>" or "g:<uuid>". */
function parsePayer(value: string): {
  player_id: string | null;
  group_id: string | null;
} {
  if (value.startsWith("g:")) return { player_id: null, group_id: value.slice(2) };
  if (value.startsWith("p:")) return { player_id: value.slice(2), group_id: null };
  return { player_id: null, group_id: null };
}

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

/** Route a payer to the wallet that actually carries their balance. */
async function resolveWallet(
  supabase: AdminClient,
  player_id: string | null,
  group_id: string | null,
  onDate: string,
) {
  if (group_id) {
    return { player_id: null, player_group_id: group_id };
  }
  if (player_id) {
    return resolveWalletOwner(supabase, player_id, onDate);
  }
  return { player_id: null, player_group_id: null };
}

/** Insert a single payment row + its credit ledger entry. */
async function postPaymentRecord(
  supabase: AdminClient,
  opts: {
    player_id: string | null;
    group_id: string | null;
    payment_date: string;
    amount: number;
    booking_id: string | null;
    team_expense_id: string | null;
    payment_method: string | null;
    reference_number: string | null;
    notes: string | null;
    ledgerDescription: (code: string) => string;
  },
): Promise<{ ok: true; code: string } | { ok: false; message: string }> {
  const code = await nextCode(supabase, "payments", "payment_code", "PAY");

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_code: code,
      payment_date: opts.payment_date,
      payer_player_id: opts.player_id,
      payer_group_id: opts.group_id,
      booking_id: opts.booking_id,
      team_expense_id: opts.team_expense_id,
      amount: opts.amount,
      payment_method: opts.payment_method,
      reference_number: opts.reference_number,
      notes: opts.notes,
    })
    .select("id")
    .single();

  if (payErr || !payment?.id) {
    return {
      ok: false,
      message: payErr?.message ?? "Could not record payment",
    };
  }

  const wallet = await resolveWallet(
    supabase,
    opts.player_id,
    opts.group_id,
    opts.payment_date,
  );

  const { error: ledgerErr } = await supabase.from("ledger_entries").insert({
    entry_date: opts.payment_date,
    player_id: wallet.player_id,
    player_group_id: wallet.player_group_id,
    source_type: "payment",
    source_id: payment.id,
    description: opts.ledgerDescription(code),
    debit_amount: 0,
    credit_amount: opts.amount,
  });

  if (ledgerErr) {
    return { ok: false, message: ledgerErr.message };
  }

  return { ok: true, code };
}

/** Preview open charges for bulk payment (oldest first). */
export async function previewBulkPayment(payer: string): Promise<BulkPreview> {
  const { player_id, group_id } = parsePayer(payer);
  if (!player_id && !group_id) return { charges: [], totalOwed: 0 };

  const { supabase } = await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const wallet = await resolveWallet(supabase, player_id, group_id, today);
  const charges = await getOpenCharges(supabase, wallet);
  return { charges, totalOwed: totalOpenDue(charges) };
}

export async function createPayment(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const { player_id, group_id } = parsePayer(String(formData.get("payer") || ""));
  const amount = Math.abs(parseFloat(String(formData.get("amount") || "0")));
  if (!amount || (!player_id && !group_id)) {
    return {
      ok: false,
      message: "Please select a payer and enter an amount greater than zero.",
    };
  }

  const payment_date =
    String(formData.get("payment_date") || "") ||
    new Date().toISOString().slice(0, 10);
  // A payment can target a booking OR a team expense (or neither = advance).
  const booking_id = String(formData.get("booking_id") || "") || null;
  const team_expense_id = booking_id
    ? null
    : String(formData.get("team_expense_id") || "") || null;
  const payment_method =
    String(formData.get("payment_method") || "").trim() || null;
  const reference_number =
    String(formData.get("reference_number") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { supabase } = await requireAdmin();
  const result = await postPaymentRecord(supabase, {
    player_id,
    group_id,
    payment_date,
    amount,
    booking_id,
    team_expense_id,
    payment_method,
    reference_number,
    notes,
    ledgerDescription: (code) =>
      `Payment ${code}${
        booking_id
          ? " (booking)"
          : team_expense_id
            ? " (team expense)"
            : " (advance / general)"
      }`,
  });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  if (booking_id) revalidatePath(`/admin/bookings/${booking_id}`);
  if (team_expense_id) revalidatePath(`/admin/expenses/${team_expense_id}`);

  return {
    ok: true,
    message: `Recorded ${formatMoney(amount)} (${result.code}).`,
  };
}

/**
 * Record a lump sum and auto-apply it to the oldest open charges first
 * (court shares, then team expenses), keeping any remainder as advance credit.
 * Each slice becomes its own payment row tagged to the charge it settles.
 */
export async function createBulkPayment(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const { player_id, group_id } = parsePayer(String(formData.get("payer") || ""));
  const amount = Math.abs(parseFloat(String(formData.get("amount") || "0")));
  if (!amount || (!player_id && !group_id)) {
    return {
      ok: false,
      message: "Please select a payer and enter an amount greater than zero.",
    };
  }

  const payment_date =
    String(formData.get("payment_date") || "") ||
    new Date().toISOString().slice(0, 10);
  const payment_method =
    String(formData.get("payment_method") || "").trim() || null;
  const reference_number =
    String(formData.get("reference_number") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const { supabase } = await requireAdmin();
  const wallet = await resolveWallet(supabase, player_id, group_id, payment_date);
  const open = await getOpenCharges(supabase, wallet);
  const plan = planBulkAllocation(open, amount);

  if (plan.length === 0) {
    return { ok: false, message: "Nothing to allocate." };
  }

  const codes: string[] = [];
  const bookingIds = new Set<string>();
  const expenseIds = new Set<string>();

  for (const line of plan) {
    const suffix =
      line.kind === "advance" ? "advance / overpayment" : line.charge!.label;
    const lineNotes = notes
      ? `Bulk settlement · ${notes} · ${suffix}`
      : `Bulk settlement · ${suffix}`;

    const result = await postPaymentRecord(supabase, {
      player_id,
      group_id,
      payment_date,
      amount: line.amount,
      booking_id: line.charge?.booking_id ?? null,
      team_expense_id: line.charge?.team_expense_id ?? null,
      payment_method,
      reference_number,
      notes: lineNotes,
      ledgerDescription: () =>
        line.kind === "advance"
          ? "Bulk payment — advance credit"
          : `Bulk payment — ${line.charge!.label}`,
    });

    if (!result.ok) {
      return {
        ok: false,
        message: `Stopped after ${codes.length} payment(s): ${result.message}`,
      };
    }
    codes.push(result.code);
    if (line.charge?.booking_id) bookingIds.add(line.charge.booking_id);
    if (line.charge?.team_expense_id)
      expenseIds.add(line.charge.team_expense_id);
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  revalidatePath("/admin/collections");
  for (const bid of bookingIds) revalidatePath(`/admin/bookings/${bid}`);
  for (const eid of expenseIds) revalidatePath(`/admin/expenses/${eid}`);

  const chargeCount = plan.filter((l) => l.kind === "charge").length;
  const advance = plan.find((l) => l.kind === "advance");
  let message = `Recorded ${formatMoney(amount)} as ${codes.length} payment(s) (${codes.join(", ")}).`;
  if (chargeCount > 0) {
    message += ` Applied to ${chargeCount} oldest charge${chargeCount === 1 ? "" : "s"}.`;
  }
  if (advance) {
    message += ` ${formatMoney(advance.amount)} kept as advance credit.`;
  }

  return { ok: true, message };
}

/** Reverse a payment by voiding its ledger entry (audit-safe, no hard delete). */
export async function reversePayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  await voidLedgerForSource(supabase, "payment", id);
  const { data: pay } = await supabase
    .from("payments")
    .select("notes, booking_id, team_expense_id")
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
  if (pay?.booking_id) revalidatePath(`/admin/bookings/${pay.booking_id}`);
  if (pay?.team_expense_id)
    revalidatePath(`/admin/expenses/${pay.team_expense_id}`);
  return actionOk("Payment reversed — ledger credit voided.");
}
