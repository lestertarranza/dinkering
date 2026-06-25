"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import { uploadPaymentScreenshot } from "@/lib/payment-screenshot";
import {
  nextCode,
  round2,
  resolveWalletOwner,
} from "@/lib/ledger";
import { rebuildBookingSharesAtomic } from "@/lib/ledger-rpc";
import type { BookingStatus, ResponseStatus, ActualStatus } from "@/lib/types";

function computeTotal(fd: FormData) {
  const courts = parseFloat(String(fd.get("courts_booked") || "1")) || 0;
  const hours = parseFloat(String(fd.get("hours") || "1")) || 0;
  const rate = parseFloat(String(fd.get("rate_per_court_per_hour") || "0")) || 0;
  const other = parseFloat(String(fd.get("other_fees") || "0")) || 0;
  return round2(courts * hours * rate + other);
}

export async function createBooking(formData: FormData) {
  const { supabase } = await requireAdmin();
  const code =
    String(formData.get("booking_code") || "").trim() ||
    (await nextCode(supabase, "bookings", "booking_code", "PB"));

  const { data } = await supabase
    .from("bookings")
    .insert({
      booking_code: code,
      play_date: String(formData.get("play_date")),
      start_time: String(formData.get("start_time") || "") || null,
      end_time: String(formData.get("end_time") || "") || null,
      venue: String(formData.get("venue") || "").trim() || null,
      court_number: String(formData.get("court_number") || "").trim() || null,
      booking_reference:
        String(formData.get("booking_reference") || "").trim() || null,
      courts_booked: parseFloat(String(formData.get("courts_booked") || "1")),
      hours: parseFloat(String(formData.get("hours") || "1")),
      rate_per_court_per_hour: parseFloat(
        String(formData.get("rate_per_court_per_hour") || "0"),
      ),
      other_fees: parseFloat(String(formData.get("other_fees") || "0")),
      total_booking_cost: computeTotal(formData),
      status: String(formData.get("status") || "booked"),
      notes: String(formData.get("notes") || "").trim() || null,
    })
    .select("id")
    .single();

  revalidatePath("/admin/bookings");
  if (data?.id) redirect(`/admin/bookings/${data.id}`);
}

export async function updateBooking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const play_date = String(formData.get("play_date"));
  if (!play_date) return actionErr("Play date is required.");
  const { supabase } = await requireAdmin();
  await supabase
    .from("bookings")
    .update({
      booking_code: String(formData.get("booking_code") || "").trim() || null,
      play_date,
      start_time: String(formData.get("start_time") || "") || null,
      end_time: String(formData.get("end_time") || "") || null,
      venue: String(formData.get("venue") || "").trim() || null,
      court_number: String(formData.get("court_number") || "").trim() || null,
      booking_reference:
        String(formData.get("booking_reference") || "").trim() || null,
      courts_booked: parseFloat(String(formData.get("courts_booked") || "1")),
      hours: parseFloat(String(formData.get("hours") || "1")),
      rate_per_court_per_hour: parseFloat(
        String(formData.get("rate_per_court_per_hour") || "0"),
      ),
      other_fees: parseFloat(String(formData.get("other_fees") || "0")),
      total_booking_cost: computeTotal(formData),
      status: String(formData.get("status") || "booked"),
      notes: String(formData.get("notes") || "").trim() || null,
    })
    .eq("id", id);
  revalidatePath(`/admin/bookings/${id}`);
  revalidatePath("/admin/bookings");
  return actionOk("Booking saved.");
}

export async function setBookingStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as BookingStatus;
  const { supabase } = await requireAdmin();
  await supabase.from("bookings").update({ status }).eq("id", id);
  revalidatePath(`/admin/bookings/${id}`);
  revalidatePath("/admin/bookings");
  return actionOk(`Booking marked as ${status}.`);
}

/** Add a player to a booking's roster (creates an attendance row). */
export async function addAttendee(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  const player_id = String(formData.get("player_id"));
  if (!player_id) return actionErr("Select a player to add.");
  const { supabase } = await requireAdmin();
  const { data: player } = await supabase
    .from("players")
    .select("name")
    .eq("id", player_id)
    .single();
  await supabase
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id, response_status: "no_response" },
      { onConflict: "booking_id,player_id", ignoreDuplicates: true },
    );
  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk(`${player?.name ?? "Player"} added to roster.`);
}

/** Add every active player to a booking's roster in one click. */
export async function addAllActivePlayers(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  if (!booking_id) return actionErr("Missing booking.");
  const { supabase } = await requireAdmin();
  const { data: players } = await supabase
    .from("players")
    .select("id")
    .eq("active_status", "active");
  const rows = (players ?? []).map((p) => ({
    booking_id,
    player_id: p.id as string,
    response_status: "no_response" as ResponseStatus,
  }));
  if (rows.length > 0) {
    await supabase
      .from("booking_attendance")
      .upsert(rows, {
        onConflict: "booking_id,player_id",
        ignoreDuplicates: true,
      });
  }
  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk(`Added ${rows.length} active player${rows.length === 1 ? "" : "s"} to roster.`);
}

/** Admin records or overrides a player's RSVP response. */
export async function setResponse(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  const player_id = String(formData.get("player_id"));
  const response_status = String(
    formData.get("response_status"),
  ) as ResponseStatus;
  const { supabase } = await requireAdmin();
  await supabase
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id, response_status },
      { onConflict: "booking_id,player_id" },
    );
  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk("RSVP updated.");
}

/** Confirm actual attendance after the game. */
/** Quick single-player attendance confirm — one click from the row button. */
export async function setPlayerActualStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  const player_id = String(formData.get("player_id"));
  const actual_status = String(
    formData.get("actual_status") || "attended",
  ) as ActualStatus;
  const { supabase } = await requireAdmin();
  await supabase
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id, actual_status, confirmed_by_admin: true },
      { onConflict: "booking_id,player_id" },
    );
  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk(`Marked as ${actual_status}.`);
}

export async function confirmAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  const { supabase } = await requireAdmin();
  const ids = formData.getAll("attendee_ids").map(String);

  for (const player_id of ids) {
    const actual = String(
      formData.get(`actual-${player_id}`) || "absent",
    ) as ActualStatus;
    await supabase
      .from("booking_attendance")
      .upsert(
        {
          booking_id,
          player_id,
          actual_status: actual,
          confirmed_by_admin: true,
        },
        { onConflict: "booking_id,player_id" },
      );
  }
  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk(`Attendance saved for ${ids.length} player${ids.length === 1 ? "" : "s"}.`);
}

type ShareRow = {
  player_id: string;
  share_units: number;
  override_share_amount: number | null;
};

type BookingRecord = {
  id: string;
  play_date: string;
  booking_code: string | null;
  total_booking_cost: number;
};

/**
 * Generate booking shares from the submitted roster.
 */
export async function generateShares(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  const { supabase } = await requireAdmin();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .single();
  if (!booking) return actionErr("Booking not found.");

  const playerIds = formData
    .getAll("share_player_ids")
    .map(String)
    .filter((pid) => formData.get(`include-${pid}`) === "on");

  const rows: ShareRow[] = playerIds.map((pid) => {
    const units = parseFloat(String(formData.get(`units-${pid}`) || "1")) || 0;
    const overrideRaw = String(formData.get(`override-${pid}`) || "").trim();
    const override = overrideRaw === "" ? null : parseFloat(overrideRaw);
    return { player_id: pid, share_units: units, override_share_amount: override };
  });

  if (rows.length === 0) {
    return actionErr("Select at least one player to include in shares.");
  }

  try {
    await rebuildBookingSharesAtomic(supabase, booking as BookingRecord, rows);
  } catch (e) {
    return actionErr(
      e instanceof Error ? e.message : "Could not generate shares.",
    );
  }

  revalidatePath(`/admin/bookings/${booking_id}`);
  revalidatePath("/admin");
  return actionOk(
    `Shares generated for ${rows.length} player${rows.length === 1 ? "" : "s"} (${formatMoney(booking.total_booking_cost)} total).`,
  );
}

const CHARGEABLE_ACTUAL = new Set(["attended", "late_cancel", "guest"]);

/**
 * One-click: charge everyone who played. Splits the cost equally (1 unit each)
 * across players whose confirmed attendance is chargeable, or — if attendance
 * hasn't been confirmed yet — those who RSVP'd "going".
 */
export async function chargeAttendees(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id"));
  const { supabase } = await requireAdmin();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .single();
  if (!booking) return actionErr("Booking not found.");

  const { data: roster } = await supabase
    .from("booking_attendance")
    .select("player_id, response_status, actual_status")
    .eq("booking_id", booking_id);

  const included = (roster ?? []).filter((r) =>
    r.actual_status
      ? CHARGEABLE_ACTUAL.has(r.actual_status as string)
      : r.response_status === "going",
  );
  if (included.length === 0) {
    return actionErr("No chargeable players — confirm attendance or RSVP first.");
  }

  const rows: ShareRow[] = included.map((r) => ({
    player_id: r.player_id as string,
    share_units: 1,
    override_share_amount: null,
  }));

  try {
    await rebuildBookingSharesAtomic(supabase, booking as BookingRecord, rows);
  } catch (e) {
    return actionErr(
      e instanceof Error ? e.message : "Could not charge attendees.",
    );
  }

  revalidatePath(`/admin/bookings/${booking_id}`);
  revalidatePath("/admin");
  return actionOk(
    `Charged ${included.length} player${included.length === 1 ? "" : "s"} (${formatMoney(booking.total_booking_cost)} split equally).`,
  );
}

export async function deleteBooking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
  const { data: shares } = await supabase
    .from("booking_shares")
    .select("id")
    .eq("booking_id", id);
  if ((shares ?? []).length > 0) {
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    revalidatePath(`/admin/bookings/${id}`);
    revalidatePath("/admin/bookings");
    return actionOk(
      "Booking cancelled — it had shares, so it was marked cancelled instead of deleted.",
    );
  }
  await supabase.from("bookings").delete().eq("id", id);
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings");
}

/**
 * Quick "mark as paid" directly from the booking detail page.
 * Records a payment for the outstanding share amount for a specific player
 * or group, tagged to this booking. Respects group wallet routing.
 */
export async function markBookingSharePaid(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id") || "");
  const payerKey = String(formData.get("payer") || "");
  const amount = Math.abs(
    parseFloat(String(formData.get("amount") || "0")),
  );
  const payment_date =
    String(formData.get("payment_date") || "") ||
    new Date().toISOString().slice(0, 10);

  if (!booking_id || !payerKey || !amount)
    return actionErr("Missing required fields.");

  const player_id = payerKey.startsWith("p:") ? payerKey.slice(2) : null;
  const group_id = payerKey.startsWith("g:") ? payerKey.slice(2) : null;
  if (!player_id && !group_id)
    return actionErr("Invalid payer.");

  // Upload screenshot if provided
  const screenshotFile = formData.get("screenshot") as File | null;
  const screenshot_url = await uploadPaymentScreenshot(
    screenshotFile,
    `PAY-${Date.now()}`,
  );

  const { supabase } = await requireAdmin();

  // Resolve wallet — if player is in a pooled group, credit goes there.
  const wallet = group_id
    ? { player_id: null, player_group_id: group_id }
    : await resolveWalletOwner(supabase, player_id!, payment_date);

  const code = await nextCode(supabase, "payments", "payment_code", "PAY");

  const { data: pay, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_code: code,
      payment_date,
      payer_player_id: player_id,
      payer_group_id: group_id,
      booking_id,
      amount,
      notes: "Marked as paid from booking page",
      screenshot_url: screenshot_url ?? null,
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
    description: `Payment ${code} (booking)`,
    debit_amount: 0,
    credit_amount: amount,
  });

  revalidatePath(`/admin/bookings/${booking_id}`);
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  return actionOk(`Recorded ${formatMoney(amount)} — ${code}.`);
}
