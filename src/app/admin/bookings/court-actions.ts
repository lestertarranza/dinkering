"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import type { ResponseStatus } from "@/lib/types";

/** Add a court to a booking. */
export async function addCourt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const booking_id = String(formData.get("booking_id") || "");
  const court_number = String(formData.get("court_number") || "").trim() || null;
  const start_time = String(formData.get("start_time") || "") || null;
  const end_time = String(formData.get("end_time") || "") || null;
  const hours = parseFloat(String(formData.get("hours") || "1")) || 1;
  const rate = parseFloat(String(formData.get("rate_per_court_per_hour") || "0")) || 0;
  const max_players = parseInt(String(formData.get("max_players") || "0"), 10) || 0;

  if (!booking_id) return actionErr("Booking ID required.");
  if (hours <= 0) return actionErr("Hours must be greater than 0.");

  const { supabase } = await requireAdmin();

  const { error } = await supabase.from("booking_courts").insert({
    booking_id,
    court_number,
    start_time,
    end_time,
    hours,
    rate_per_court_per_hour: rate,
    max_players,
  });

  if (error) return actionErr(error.message);

  // After adding a court, check if any waitlisted players can be admitted.
  await admitWaitlistedPlayers(supabase, booking_id);

  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk("Court added.");
}

/** Update an existing court. */
export async function updateCourt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const booking_id = String(formData.get("booking_id") || "");
  const court_number = String(formData.get("court_number") || "").trim() || null;
  const start_time = String(formData.get("start_time") || "") || null;
  const end_time = String(formData.get("end_time") || "") || null;
  const hours = parseFloat(String(formData.get("hours") || "1")) || 1;
  const rate = parseFloat(String(formData.get("rate_per_court_per_hour") || "0")) || 0;
  const max_players = parseInt(String(formData.get("max_players") || "0"), 10) || 0;

  if (!id || !booking_id) return actionErr("Court and booking ID required.");

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("booking_courts")
    .update({ court_number, start_time, end_time, hours, rate_per_court_per_hour: rate, max_players })
    .eq("id", id);

  if (error) return actionErr(error.message);

  // Max players may have increased — admit waitlisted players if possible.
  await admitWaitlistedPlayers(supabase, booking_id);

  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk("Court updated.");
}

/** Remove a court from a booking. */
export async function removeCourt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  const booking_id = String(formData.get("booking_id") || "");
  if (!id || !booking_id) return actionErr("Court and booking ID required.");

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("booking_courts").delete().eq("id", id);
  if (error) return actionErr(error.message);

  revalidatePath(`/admin/bookings/${booking_id}`);
  return actionOk("Court removed.");
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

/** Total capacity of all courts on a booking (0 = unlimited). */
async function getTotalCapacity(
  supabase: SupabaseClient,
  booking_id: string,
): Promise<number> {
  const { data } = await supabase
    .from("booking_courts")
    .select("max_players")
    .eq("booking_id", booking_id);
  const courts = (data ?? []) as { max_players: number }[];
  // If any court is unlimited (0), whole booking is unlimited.
  if (courts.some((c) => c.max_players === 0)) return 0;
  return courts.reduce((s, c) => s + c.max_players, 0);
}

/** Current count of "going" attendees for a booking. */
async function getGoingCount(
  supabase: SupabaseClient,
  booking_id: string,
): Promise<number> {
  const { count } = await supabase
    .from("booking_attendance")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking_id)
    .eq("response_status", "going");
  return count ?? 0;
}

/**
 * After capacity increases (court added / max_players raised / player cancels),
 * promote the oldest waitlisted players to "going" up to the new capacity.
 */
export async function admitWaitlistedPlayers(
  supabase: SupabaseClient,
  booking_id: string,
): Promise<void> {
  const capacity = await getTotalCapacity(supabase, booking_id);
  if (capacity === 0) {
    // Unlimited — promote all waitlisted to going.
    await supabase
      .from("booking_attendance")
      .update({ response_status: "going" as ResponseStatus })
      .eq("booking_id", booking_id)
      .eq("response_status", "waitlist");
    return;
  }

  const going = await getGoingCount(supabase, booking_id);
  const slots = capacity - going;
  if (slots <= 0) return;

  // Get oldest waitlisted players (by created_at, FIFO).
  const { data: waitlisted } = await supabase
    .from("booking_attendance")
    .select("id")
    .eq("booking_id", booking_id)
    .eq("response_status", "waitlist")
    .order("created_at")
    .limit(slots);

  const ids = (waitlisted ?? []).map((r) => r.id as string);
  if (ids.length === 0) return;

  await supabase
    .from("booking_attendance")
    .update({ response_status: "going" as ResponseStatus })
    .in("id", ids);
}

/** Exported so RSVP cancel action can call it. */
export { getTotalCapacity, getGoingCount };
