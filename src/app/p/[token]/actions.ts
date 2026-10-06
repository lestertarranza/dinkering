"use server";

import { revalidatePath } from "next/cache";
import { isRsvpLocked } from "@/lib/rsvp-lock";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResponseStatus } from "@/lib/types";
import { logRsvpChange } from "@/lib/activity-log";
import { getAuthContext } from "@/lib/auth";
import { getPlayerLink } from "@/lib/accounts";
import { canEditPublicRsvp } from "@/lib/rsvp-auth";
import { getAdminViewAs } from "@/lib/view-as";
import { admitWaitlistedPlayers, upsertAttendanceRsvp } from "@/lib/waitlist";
import { syncSeatHold } from "@/lib/seat-hold-db";

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
    .select("id, name")
    .eq("public_token", token)
    .single();
  if (!player) {
    return { ok: false, message: "Player not found.", previous: "", saved: "", bookingId: booking_id };
  }

  const [link, auth, viewAs] = await Promise.all([
    getPlayerLink(player.id),
    getAuthContext(),
    getAdminViewAs(),
  ]);
  const actingAsPlayer = viewAs?.playerId === player.id;
  if (
    !canEditPublicRsvp({
      claimed: link.linked,
      viewerPlayerId: auth.profile?.player_id,
      targetPlayerId: player.id,
      adminViewAsPlayerId: viewAs?.playerId,
    })
  ) {
    return {
      ok: false,
      message:
        "Sign in as this player to change RSVP.",
      previous: "",
      saved: "",
      bookingId: booking_id,
    };
  }

  const [{ data: booking }, { data: courts }] = await Promise.all([
    db.from("bookings").select("play_date, start_time, booking_code").eq("id", booking_id).single(),
    db.from("booking_courts").select("max_players, start_time").eq("booking_id", booking_id),
  ]);
  const courtList = (courts ?? []) as { max_players: number; start_time: string | null }[];

  const { data: existing } = await db
    .from("booking_attendance")
    .select("*")
    .eq("booking_id", booking_id)
    .eq("player_id", player.id)
    .maybeSingle();
  const prevStatus =
    ((existing as { response_status?: ResponseStatus } | null)?.response_status) ??
    "no_response";
  const prevWaitlistedAt =
    ((existing as { waitlisted_at?: string | null } | null)?.waitlisted_at) ??
    null;

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

  const holdError = await syncSeatHold(db, {
    bookingId: booking_id,
    playerId: player.id,
    nextStatus: response_status,
    prevStatus,
    waived: false,
    bookingCode: (booking as { booking_code?: string | null } | null)?.booking_code,
    playDate: (booking as { play_date?: string | null } | null)?.play_date,
  });
  if (holdError) {
    revalidatePath(`/p/${token}`);
    return {
      ok: false,
      message: holdError,
      previous: prevStatus,
      saved: prevStatus,
      bookingId: booking_id,
    };
  }

  const savedRsvp = await upsertAttendanceRsvp(db, {
    booking_id,
    player_id: player.id,
    response_status,
    prevStatus,
    prevWaitlistedAt,
  });
  if (savedRsvp.error) {
    await syncSeatHold(db, {
      bookingId: booking_id,
      playerId: player.id,
      nextStatus: prevStatus,
      prevStatus: response_status,
      waived: false,
      bookingCode: (booking as { booking_code?: string | null } | null)?.booking_code,
      playDate: (booking as { play_date?: string | null } | null)?.play_date,
    });
    return {
      ok: false,
      message: "Could not save RSVP.",
      previous: prevStatus,
      saved: prevStatus,
      bookingId: booking_id,
    };
  }

  const wasCancelled = prevStatus === "going" && response_status !== "going";

  if (wasCancelled) {
    await admitWaitlistedPlayers(db, booking_id);
  }

  revalidatePath(`/p/${token}`);
  revalidatePath(`/admin/players/${player.id}`);
  revalidatePath(`/admin/bookings/${booking_id}`);
  if (prevStatus !== response_status) {
    await logRsvpChange({
      playerId: player.id,
      bookingId: booking_id,
      playerName: player.name as string,
      bookingCode: (booking as { booking_code?: string | null } | null)?.booking_code,
      from: prevStatus,
      to: response_status,
      actorEmail: actingAsPlayer ? auth.user?.email ?? null : undefined,
      via: actingAsPlayer ? "view_as" : "player",
    });
  }
  const waitlisted = response_status === "waitlist" && requested === "going";
  return {
    ok: true,
    message: waitlisted
      ? "Booking is full. You're on the waitlist"
      : labelOf(response_status),
    previous: prevStatus,
    saved: response_status,
    bookingId: booking_id,
  };
}
