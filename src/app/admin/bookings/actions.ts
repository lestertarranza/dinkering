"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  nextCode,
  round2,
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

export async function updateBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
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
  const { supabase } = await requireAdmin();
  await supabase.from("bookings").update({ status }).eq("id", id);
  revalidatePath(`/admin/bookings/${id}`);
  revalidatePath("/admin/bookings");
}

/** Add a player to a booking's roster (creates an attendance row). */
export async function addAttendee(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const player_id = String(formData.get("player_id"));
  if (!player_id) return;
  const { supabase } = await requireAdmin();
  await supabase
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id, response_status: "no_response" },
      { onConflict: "booking_id,player_id", ignoreDuplicates: true },
    );
  revalidatePath(`/admin/bookings/${booking_id}`);
}

/** Add every active player to a booking's roster in one click. */
export async function addAllActivePlayers(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  if (!booking_id) return;
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
}

/** Admin records or overrides a player's RSVP response. */
export async function setResponse(formData: FormData) {
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
}

/** Confirm actual attendance after the game. */
export async function confirmAttendance(formData: FormData) {
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
export async function generateShares(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const { supabase } = await requireAdmin();

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

  const rows: ShareRow[] = playerIds.map((pid) => {
    const units = parseFloat(String(formData.get(`units-${pid}`) || "1")) || 0;
    const overrideRaw = String(formData.get(`override-${pid}`) || "").trim();
    const override = overrideRaw === "" ? null : parseFloat(overrideRaw);
    return { player_id: pid, share_units: units, override_share_amount: override };
  });

  await rebuildBookingSharesAtomic(supabase, booking as BookingRecord, rows);
  revalidatePath(`/admin/bookings/${booking_id}`);
}

const CHARGEABLE_ACTUAL = new Set(["attended", "late_cancel", "guest"]);

/**
 * One-click: charge everyone who played. Splits the cost equally (1 unit each)
 * across players whose confirmed attendance is chargeable, or — if attendance
 * hasn't been confirmed yet — those who RSVP'd "going".
 */
export async function chargeAttendees(formData: FormData) {
  const booking_id = String(formData.get("booking_id"));
  const { supabase } = await requireAdmin();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", booking_id)
    .single();
  if (!booking) return;

  const { data: roster } = await supabase
    .from("booking_attendance")
    .select("player_id, response_status, actual_status")
    .eq("booking_id", booking_id);

  const included = (roster ?? []).filter((r) =>
    r.actual_status
      ? CHARGEABLE_ACTUAL.has(r.actual_status as string)
      : r.response_status === "going",
  );
  const rows: ShareRow[] = included.map((r) => ({
    player_id: r.player_id as string,
    share_units: 1,
    override_share_amount: null,
  }));

  await rebuildBookingSharesAtomic(supabase, booking as BookingRecord, rows);
  revalidatePath(`/admin/bookings/${booking_id}`);
}

export async function deleteBooking(formData: FormData) {
  const id = String(formData.get("id"));
  const { supabase } = await requireAdmin();
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
