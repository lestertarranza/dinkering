"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import {
  round2,
  resolveWalletOwner,
  postLedgerEntries,
  voidLedgerForSource,
  type LedgerEntryInput,
} from "@/lib/ledger";
import { fundBalanceFromEntries } from "@/lib/club-funds";

function revalidateFunds(id?: string, bookingId?: string | null) {
  revalidatePath("/admin/funds");
  revalidatePath("/admin");
  revalidatePath("/admin/collections");
  if (id) revalidatePath(`/admin/funds/${id}`);
  if (bookingId) revalidatePath(`/admin/bookings/${bookingId}`);
}

async function remainingForFund(
  supabase: SupabaseClient,
  fundId: string,
): Promise<number> {
  const { data } = await supabase
    .from("club_fund_entries")
    .select("kind, amount, voided")
    .eq("fund_id", fundId);
  return fundBalanceFromEntries(
    (data ?? []) as { kind: string; amount: number; voided: boolean }[],
  );
}

const chargeable = new Set(["attended", "late_cancel", "guest"]);

async function goingOrAttendedIds(
  db: SupabaseClient,
  bookingId: string,
): Promise<string[]> {
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

export async function createFund(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const notes = String(formData.get("notes") || "").trim() || null;
  const targetRaw = String(formData.get("target_amount") || "").trim();
  const target_amount = targetRaw ? Math.abs(parseFloat(targetRaw)) : null;

  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("club_item_funds")
    .insert({
      name,
      notes,
      target_amount:
        target_amount && Number.isFinite(target_amount) && target_amount > 0
          ? round2(target_amount)
          : null,
    })
    .select("id")
    .single();

  revalidateFunds();
  if (data?.id) redirect(`/admin/funds/${data.id}`);
}

export async function updateFund(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) return actionErr("Name is required.");
  const notes = String(formData.get("notes") || "").trim() || null;
  const targetRaw = String(formData.get("target_amount") || "").trim();
  const targetParsed = targetRaw ? Math.abs(parseFloat(targetRaw)) : null;
  const target_amount =
    targetParsed && Number.isFinite(targetParsed) && targetParsed > 0
      ? round2(targetParsed)
      : null;
  const status = String(formData.get("status") || "active");

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("club_item_funds")
    .update({
      name,
      notes,
      target_amount,
      status: status === "archived" ? "archived" : "active",
    })
    .eq("id", id);
  if (error) return actionErr(error.message);
  revalidateFunds(id);
  return actionOk("Fund saved.");
}

/** Manual add (opening cash, donation). Does not charge players. */
export async function addFundMoney(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const fund_id = String(formData.get("fund_id") || "");
  const amount = round2(Math.abs(parseFloat(String(formData.get("amount") || "0"))));
  if (!fund_id) return actionErr("Missing fund.");
  if (!Number.isFinite(amount) || amount <= 0) {
    return actionErr("Enter an amount greater than zero.");
  }
  const entry_date =
    String(formData.get("entry_date") || "") ||
    new Date().toISOString().slice(0, 10);
  const description =
    String(formData.get("description") || "").trim() || "Set aside";

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("club_fund_entries").insert({
    fund_id,
    kind: "allocate",
    amount,
    entry_date,
    description,
  });
  if (error) return actionErr(error.message);
  revalidateFunds(fund_id);
  return actionOk("Money added to this fund.");
}

/** Buy an identifiable club item. Credits the buyer. May overdraw the pot. */
export async function recordFundPurchase(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const fund_id = String(formData.get("fund_id") || "");
  const item = String(formData.get("description") || "").trim();
  const payer = String(formData.get("payer") || "");
  const amount = round2(Math.abs(parseFloat(String(formData.get("amount") || "0"))));
  if (!fund_id) return actionErr("Missing fund.");
  if (!item) return actionErr("Say what you bought (e.g. 3 tubes of Franklin balls).");
  if (!payer) return actionErr("Select who bought it. They get the wallet credit.");
  if (!Number.isFinite(amount) || amount <= 0) {
    return actionErr("Enter an amount greater than zero.");
  }
  const paid_by_player_id = payer.startsWith("p:") ? payer.slice(2) : null;
  const paid_by_group_id = payer.startsWith("g:") ? payer.slice(2) : null;
  const entry_date =
    String(formData.get("entry_date") || "") ||
    new Date().toISOString().slice(0, 10);

  const { supabase } = await requireAdmin();
  const remaining = await remainingForFund(supabase, fund_id);
  const overdrawn = round2(amount - remaining);

  const { data: row, error } = await supabase
    .from("club_fund_entries")
    .insert({
      fund_id,
      kind: "spend",
      amount,
      entry_date,
      description: item,
      paid_by_player_id,
      paid_by_group_id,
    })
    .select("id")
    .single();
  if (error || !row) return actionErr(error?.message ?? "Could not record purchase.");

  let creditPlayer = paid_by_player_id;
  let creditGroup = paid_by_group_id;
  if (paid_by_player_id) {
    const owner = await resolveWalletOwner(supabase, paid_by_player_id, entry_date);
    creditPlayer = owner.player_id;
    creditGroup = owner.player_group_id;
  }

  const { data: fund } = await supabase
    .from("club_item_funds")
    .select("name")
    .eq("id", fund_id)
    .single();
  const fundName = (fund?.name as string | undefined) || "club item";

  await postLedgerEntries(supabase, [
    {
      entry_date,
      player_id: creditPlayer,
      player_group_id: creditGroup,
      source_type: "club_fund_credit",
      source_id: row.id as string,
      description: `Club purchase · ${item} (${fundName})`,
      credit_amount: amount,
    },
  ]);

  revalidateFunds(fund_id);
  if (overdrawn > 0.005) {
    return actionOk(
      `Purchase recorded. ${formatMoney(amount)} credited to the buyer. This fund is now ${formatMoney(overdrawn)} overdrawn. Future game contributions will refill it.`,
    );
  }
  return actionOk(
    `Purchase recorded. ${formatMoney(amount)} credited to the buyer and deducted from the fund.`,
  );
}

/** Charge Going/attended players on a booking; add the total to a club pot. */
export async function chargeGameContribution(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id") || "");
  const fund_id = String(formData.get("fund_id") || "");
  const perPlayer = round2(
    Math.abs(parseFloat(String(formData.get("amount_per_player") || "0"))),
  );
  if (!booking_id) return actionErr("Missing booking.");
  if (!fund_id) return actionErr("Select a club item fund.");
  if (!Number.isFinite(perPlayer) || perPlayer <= 0) {
    return actionErr("Enter an amount per player greater than zero.");
  }

  const { supabase } = await requireAdmin();
  const [{ data: booking }, { data: fund }, playerIds] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, play_date, booking_code")
      .eq("id", booking_id)
      .single(),
    supabase.from("club_item_funds").select("id, name").eq("id", fund_id).single(),
    goingOrAttendedIds(supabase, booking_id),
  ]);
  if (!booking) return actionErr("Booking not found.");
  if (!fund) return actionErr("Fund not found.");
  if (playerIds.length === 0) {
    return actionErr(
      "No Going or attended players yet. Add RSVPs first, then charge.",
    );
  }

  const playDate = booking.play_date as string;
  const total = round2(perPlayer * playerIds.length);
  const code = (booking.booking_code as string | null) || "game";
  const fundName = fund.name as string;
  const description = `${fundName} contribution · ${code}`;

  const { data: entry, error } = await supabase
    .from("club_fund_entries")
    .insert({
      fund_id,
      kind: "allocate",
      amount: total,
      entry_date: playDate,
      description,
      booking_id,
    })
    .select("id")
    .single();
  if (error || !entry) {
    return actionErr(error?.message ?? "Could not add to the fund.");
  }

  const shareRows = playerIds.map((player_id) => ({
    fund_entry_id: entry.id as string,
    player_id,
    amount_owed: perPlayer,
  }));
  const { data: shares, error: shareErr } = await supabase
    .from("club_fund_shares")
    .insert(shareRows)
    .select("id, player_id, amount_owed");
  if (shareErr || !shares) {
    await supabase.from("club_fund_entries").delete().eq("id", entry.id);
    return actionErr(shareErr?.message ?? "Could not charge players.");
  }

  const ledger: LedgerEntryInput[] = [];
  for (const s of shares as { id: string; player_id: string; amount_owed: number }[]) {
    const owner = await resolveWalletOwner(supabase, s.player_id, playDate);
    ledger.push({
      entry_date: playDate,
      player_id: owner.player_id,
      player_group_id: owner.player_group_id,
      source_type: "club_fund_share",
      source_id: s.id,
      description,
      debit_amount: Number(s.amount_owed),
    });
  }
  await postLedgerEntries(supabase, ledger);

  revalidateFunds(fund_id, booking_id);
  return actionOk(
    `Charged ${playerIds.length} player${playerIds.length === 1 ? "" : "s"} ${formatMoney(perPlayer)} each (${formatMoney(total)}) toward ${fundName}.`,
  );
}

export async function voidFundEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const fund_id = String(formData.get("fund_id") || "");
  if (!id) return actionErr("Missing entry.");
  const { supabase } = await requireAdmin();

  const { data: entry } = await supabase
    .from("club_fund_entries")
    .select("id, kind, booking_id, voided")
    .eq("id", id)
    .single();
  if (!entry || entry.voided) return actionErr("Entry already voided.");

  if (entry.kind === "spend") {
    await voidLedgerForSource(supabase, "club_fund_credit", id);
  } else {
    const { data: shares } = await supabase
      .from("club_fund_shares")
      .select("id")
      .eq("fund_entry_id", id);
    for (const s of shares ?? []) {
      await voidLedgerForSource(supabase, "club_fund_share", s.id as string);
    }
  }

  const { error } = await supabase
    .from("club_fund_entries")
    .update({ voided: true })
    .eq("id", id)
    .eq("voided", false);
  if (error) return actionErr(error.message);
  revalidateFunds(fund_id, (entry.booking_id as string | null) ?? null);
  return actionOk("Entry voided. Balance and wallets updated.");
}
