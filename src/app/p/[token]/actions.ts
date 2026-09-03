"use server";

import { revalidatePath } from "next/cache";
import { isRsvpLocked } from "@/lib/rsvp-lock";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResponseStatus } from "@/lib/types";

export type RsvpState = {
  ok: boolean;
  message: string;
  previous: string;
  saved: string;
  bookingId: string;
} | null;

function labelOf(status: string): string {
  if (status === "going") return "Going";
  if (status === "not_going") return "Not going";
  if (status === "waitlist") return "Waitlist";
  return "No response";
}

/** Player RSVP from the public portal — validated by share token. */
export async function submitRsvp(
  _prev: RsvpState,
  formData: FormData,
): Promise<RsvpState> {
  const token = String(formData.get("token") || "");
  const booking_id = String(formData.get("booking_id") || "");
  const requested = String(formData.get("response_status") || "") as ResponseStatus;
  if (!token || !booking_id) {
    return { ok: false, message: "Missing booking.", previous: "", saved: "", bookingId: booking_id };
  }
  const VALID_REQUESTS: ResponseStatus[] = ["going", "not_going", "waitlist", "no_response"];
  if (!VALID_REQUESTS.includes(requested)) {
    return { ok: false, message: "Invalid RSVP.", previous: "", saved: "", bookingId: booking_id };
  }

  const db = createAdminClient();
  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("public_token", token)
    .single();
  if (!player) {
    return { ok: false, message: "Player not found.", previous: "", saved: "", bookingId: booking_id };
  }

  const [{ data: booking }, { data: courts }] = await Promise.all([
    db.from("bookings").select("play_date, start_time").eq("id", booking_id).single(),
    db.from("booking_courts").select("max_players, start_time").eq("booking_id", booking_id),
  ]);
  const courtList = (courts ?? []) as { max_players: number; start_time: string | null }[];

  const { data: existing } = await db
    .from("booking_attendance")
    .select("response_status")
    .eq("booking_id", booking_id)
    .eq("player_id", player.id)
    .single();
  const prevStatus = (existing?.response_status as ResponseStatus | undefined) ?? "no_response";

  let response_status = requested;
  if (requested === "going") {
    const isUnlimited =
      courtList.length === 0 || courtList.some((c) => c.max_players === 0);
    if (!isUnlimited) {
      const totalCap = courtList.reduce((s, c) => s + c.max_players, 0);
      const { count: goingCount } = await db
        .from("booking_attendance")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", booking_id)
        .eq("response_status", "going");
      const alreadyGoing = prevStatus === "going" ? 1 : 0;
      if ((goingCount ?? 0) - alreadyGoing >= totalCap) {
        response_status = "waitlist";
      }
    }
  }

  const locked =
    !booking || isRsvpLocked(booking.play_date, courtList, booking.start_time);
  if (locked && prevStatus === "going" && requested !== "going") {
    revalidatePath(`/p/${token}`);
    return {
      ok: false,
      message: "RSVP is locked.",
      previous: prevStatus,
      saved: prevStatus,
      bookingId: booking_id,
    };
  }

  await db
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id: player.id, response_status },
      { onConflict: "booking_id,player_id" },
    );

  const wasCancelled =
    prevStatus === "going" &&
    response_status !== "going" &&
    response_status !== "waitlist";

  if (wasCancelled) {
    const isUnlimited =
      courtList.length === 0 || courtList.some((c) => c.max_players === 0);

    const { data: next } = await db
      .from("booking_attendance")
      .select("id")
      .eq("booking_id", booking_id)
      .eq("response_status", "waitlist")
      .order("created_at")
      .limit(isUnlimited ? 999 : 1);

    if (next && next.length > 0) {
      await db
        .from("booking_attendance")
        .update({ response_status: "going" as ResponseStatus })
        .in("id", next.map((r) => r.id as string));
    }
  }

  revalidatePath(`/p/${token}`);
  const waitlisted = response_status === "waitlist" && requested === "going";
  return {
    ok: true,
    message: waitlisted
      ? "Booking is full — you're on the waitlist"
      : labelOf(response_status),
    previous: prevStatus,
    saved: response_status,
    bookingId: booking_id,
  };
}
