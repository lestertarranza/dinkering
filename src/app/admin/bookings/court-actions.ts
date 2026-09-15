"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { actionOk, actionErr, type ActionState } from "@/lib/action-state";
import { admitWaitlistedPlayers } from "@/lib/waitlist";

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

  await admitWaitlistedPlayers(supabase, booking_id, { via: "admin" });

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

  await admitWaitlistedPlayers(supabase, booking_id, { via: "admin" });

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
