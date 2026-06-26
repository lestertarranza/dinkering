"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { formatMoney } from "@/lib/format";
import { uploadBookingConfirmations } from "@/lib/booking-confirmation";
import {
  nextCode,
  resolveWalletOwner,
} from "@/lib/ledger";
import { rebuildBookingSharesAtomic } from "@/lib/ledger-rpc";
import type { BookingStatus, ResponseStatus, ActualStatus } from "@/lib/types";

export async function createBooking(formData: FormData) {
  const { supabase } = await requireAdmin();
  const code =
    String(formData.get("booking_code") || "").trim() ||
    (await nextCode(supabase, "bookings", "booking_code", "PB"));

  // Upload confirmation screenshots if provided (supports multiple)
  const screenshotFiles = formData.getAll("confirmation_screenshot") as File[];
  const confirmation_urls = await uploadBookingConfirmations(screenshotFiles, code);

  const other_fees = parseFloat(String(formData.get("other_fees") || "0")) || 0;

  const { data } = await supabase
    .from("bookings")
    .insert({
      booking_code: code,
      play_date: String(formData.get("play_date")),
      venue: String(formData.get("venue") || "").trim() || null,
      booking_reference: String(formData.get("booking_reference") || "").trim() || null,
      other_fees,
      total_booking_cost: other_fees, // courts not added yet; trigger will update
      status: String(formData.get("status") || "for_booking"),
      notes: String(formData.get("notes") || "").trim() || null,
      confirmation_urls,
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

  // Upload any new confirmation screenshots and append to the existing list.
  const screenshotFiles = formData.getAll("confirmation_screenshot") as File[];
  const newUrls = await uploadBookingConfirmations(
    screenshotFiles,
    `PB-${id.slice(0, 8)}`,
  );

  const updateData: Record<string, unknown> = {
    booking_code: String(formData.get("booking_code") || "").trim() || null,
    play_date,
    venue: String(formData.get("venue") || "").trim() || null,
    booking_reference: String(formData.get("booking_reference") || "").trim() || null,
    other_fees: parseFloat(String(formData.get("other_fees") || "0")) || 0,
    status: String(formData.get("status") || "for_booking"),
    notes: String(formData.get("notes") || "").trim() || null,
  };

  if (newUrls.length > 0) {
    const { data: existing } = await supabase
      .from("bookings")
      .select("confirmation_urls")
      .eq("id", id)
      .single();
    const current = (existing?.confirmation_urls as string[] | null) ?? [];
    updateData.confirmation_urls = [...current, ...newUrls];
  }

  await supabase.from("bookings").update(updateData).eq("id", id);

  // Re-sync total_booking_cost after other_fees may have changed
  await supabase.rpc("sync_booking_total", { p_booking_id: id });

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

/** Remove a single confirmation screenshot URL from a booking. */
export async function removeBookingConfirmation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("booking_id"));
  const url = String(formData.get("url"));
  if (!id || !url) return actionErr("Missing booking or URL.");
  const { supabase } = await requireAdmin();
  const { data: existing } = await supabase
    .from("bookings")
    .select("confirmation_urls")
    .eq("id", id)
    .single();
  const current = (existing?.confirmation_urls as string[] | null) ?? [];
  const next = current.filter((u) => u !== url);
  await supabase.from("bookings").update({ confirmation_urls: next }).eq("id", id);
  revalidatePath(`/admin/bookings/${id}`);
  return actionOk("Screenshot removed.");
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

  // Require at least one court before generating shares.
  const { count: courtCount } = await supabase
    .from("booking_courts")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking_id);
  if ((courtCount ?? 0) === 0) {
    return actionErr("Add at least one court to this booking before generating shares.");
  }

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

  // Require at least one court.
  const { count: cCount } = await supabase
    .from("booking_courts")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking_id);
  if ((cCount ?? 0) === 0) {
    return actionErr("Add at least one court to this booking before charging attendees.");
  }

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
