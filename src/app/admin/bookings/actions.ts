"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  nextCode,
  resolveWalletOwner,
  voidLedgerForSource,
  postLedgerEntries,
  splitByUnits,
  round2,
} from "@/lib/ledger";
import type { BookingStatus, ResponseStatus, ActualStatus } from "@/lib/types";

function computeTotal(fd: FormData) {
  const courts = parseFloat(String(fd.get("courts_booked") || "1")) || 0;
  const hours = parseFloat(String(fd.get("hours") || "1")) || 0;
  const rate = parseFloat(String(fd.get("rate_per_court_per_hour") || "0")) || 0;
  const other = parseFloat(String(fd.get("other_fees") || "0")) || 0;
  return round2(courts * hours * rate + other);
}

export async function createBooking(formData: FormData) {
  const supabase = await createClient();
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

export async function updateBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase
    .from("bookings")
    .update({
      booking_code: String(formData.get("booking_code") || "").trim() || null,
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
    .eq("id", id);
  revalidatePath(`/admin/bookings/${id}`);
  revalidatePath("/admin/bookings");
}

export async function setBookingStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as BookingStatus;
  const supabase = await createClient();
  await supabase.from("bookings").update({ status }).eq("id", id);
  revalidatePath(`/admin/bookings/${id}`);
  revalidatePath("/admin/bookings");
}

/** Add a player to a booking's roster (creates an attendance row). */
export async function addAttendee(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const player_id = String(formData.get("player_id"));
  if (!player_id) return;
  const supabase = await createClient();
  await supabase
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id, response_status: "no_response" },
      { onConflict: "booking_id,player_id", ignoreDuplicates: true },
    );
  revalidatePath(`/admin/bookings/${booking_id}`);
}

/** Admin records or overrides a player's RSVP response. */
export async function setResponse(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const player_id = String(formData.get("player_id"));
  const response_status = String(
    formData.get("response_status"),
  ) as ResponseStatus;
  const supabase = await createClient();
  await supabase
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id, response_status },
      { onConflict: "booking_id,player_id" },
    );
  revalidatePath(`/admin/bookings/${booking_id}`);
}

/** Confirm actual attendance after the game. */
export async function confirmAttendance(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const supabase = await createClient();
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
}

/**
 * Generate booking shares from the submitted roster.
 * Reverses any existing shares + ledger entries for this booking first,
 * then splits the total cost by share units and posts fresh ledger entries
 * (routed to each player's wallet owner — group if pooled).
 */
export async function generateShares(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .single();
  if (!booking) return;

  const playerIds = formData
    .getAll("share_player_ids")
    .map(String)
    .filter((pid) => formData.get(`include-${pid}`) === "on");

  const rows = playerIds.map((pid) => {
    const units = parseFloat(String(formData.get(`units-${pid}`) || "1")) || 0;
    const overrideRaw = String(formData.get(`override-${pid}`) || "").trim();
    const override = overrideRaw === "" ? null : parseFloat(overrideRaw);
    return { player_id: pid, share_units: units, override_share_amount: override };
  });

  // Reverse existing shares for this booking (financial safety: void, then replace).
  const { data: existing } = await supabase
    .from("booking_shares")
    .select("id")
    .eq("booking_id", booking_id);
  for (const s of existing ?? []) {
    await voidLedgerForSource(supabase, "booking_share", s.id as string);
  }
  await supabase.from("booking_shares").delete().eq("booking_id", booking_id);

  if (rows.length === 0) {
    revalidatePath(`/admin/bookings/${booking_id}`);
    return;
  }

  const allocations = splitByUnits(rows, Number(booking.total_booking_cost));

  for (const { row, amount } of allocations) {
    const owner = await resolveWalletOwner(
      supabase,
      row.player_id,
      booking.play_date,
    );
    const { data: share } = await supabase
      .from("booking_shares")
      .insert({
        booking_id,
        player_id: row.player_id,
        player_group_id: owner.player_group_id,
        share_units: row.share_units,
        override_share_amount: row.override_share_amount,
        amount_owed: amount,
      })
      .select("id")
      .single();

    if (share?.id) {
      await postLedgerEntries(supabase, [
        {
          entry_date: booking.play_date,
          player_id: owner.player_id,
          player_group_id: owner.player_group_id,
          source_type: "booking_share",
          source_id: share.id,
          description: `Court share — ${booking.booking_code ?? "booking"}`,
          debit_amount: amount,
          credit_amount: 0,
        },
      ]);
    }
  }

  revalidatePath(`/admin/bookings/${booking_id}`);
}

export async function deleteBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { data: shares } = await supabase
    .from("booking_shares")
    .select("id")
    .eq("booking_id", id);
  if ((shares ?? []).length > 0) {
    // Has financial history — cancel instead of deleting.
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    revalidatePath(`/admin/bookings/${id}`);
    return;
  }
  await supabase.from("bookings").delete().eq("id", id);
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings");
}
