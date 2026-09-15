import type { SupabaseClient } from "@supabase/supabase-js";
import { logRsvpChange } from "@/lib/activity-log";
import { fetchAllRows } from "@/lib/paginate";
import type { ResponseStatus } from "@/lib/types";
import {
  pickWaitlistToAdmit,
  waitlistedAtPayload,
  type WaitlistRow,
} from "@/lib/waitlist-order";

export type { WaitlistRow } from "@/lib/waitlist-order";
export {
  compareWaitlistOrder,
  pickWaitlistToAdmit,
  waitlistJoinedAt,
  waitlistPositionOf,
  waitlistedAtPayload,
} from "@/lib/waitlist-order";

export type RsvpLogVia = "player" | "admin";


let waitlistedAtSupported: boolean | undefined;

export async function waitlistedAtColumnExists(
  db: SupabaseClient,
): Promise<boolean> {
  if (waitlistedAtSupported === true) return true;
  const { error } = await db
    .from("booking_attendance")
    .select("waitlisted_at")
    .limit(1);
  waitlistedAtSupported = !error;
  return waitlistedAtSupported;
}

export async function loadAttendanceRsvp(
  db: SupabaseClient,
  bookingId: string,
  playerId: string,
): Promise<{
  response_status: ResponseStatus | null;
  waitlisted_at: string | null;
}> {
  const { data } = await db
    .from("booking_attendance")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("player_id", playerId)
    .maybeSingle();
  const row = data as {
    response_status?: string;
    waitlisted_at?: string | null;
  } | null;
  return {
    response_status: (row?.response_status as ResponseStatus | undefined) ?? null,
    waitlisted_at: row?.waitlisted_at ?? null,
  };
}

export async function upsertAttendanceRsvp(
  db: SupabaseClient,
  opts: {
    booking_id: string;
    player_id: string;
    response_status: ResponseStatus;
    prevStatus?: ResponseStatus | null;
    prevWaitlistedAt?: string | null;
  },
): Promise<{ error: { message: string } | null }> {
  const payload: Record<string, unknown> = {
    booking_id: opts.booking_id,
    player_id: opts.player_id,
    response_status: opts.response_status,
    waitlisted_at: waitlistedAtPayload(
      opts.response_status,
      opts.prevStatus,
      opts.prevWaitlistedAt,
    ),
  };
  const { error } = await db.from("booking_attendance").upsert(payload, {
    onConflict: "booking_id,player_id",
  });
  if (!error) return { error: null };
  if (/waitlisted_at/i.test(error.message)) {
    waitlistedAtSupported = false;
    const { waitlisted_at: _drop, ...rest } = payload;
    const retry = await db.from("booking_attendance").upsert(rest, {
      onConflict: "booking_id,player_id",
    });
    return { error: retry.error };
  }
  return { error };
}

export async function getTotalCapacity(
  db: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data } = await db
    .from("booking_courts")
    .select("max_players")
    .eq("booking_id", bookingId);
  const courts = (data ?? []) as { max_players: number }[];
  if (courts.some((c) => c.max_players === 0)) return 0;
  return courts.reduce((s, c) => s + c.max_players, 0);
}

export async function getGoingCount(
  db: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { count } = await db
    .from("booking_attendance")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("response_status", "going");
  return count ?? 0;
}

/**
 * Fill open Going seats from the waitlist, oldest join first (FCFS).
 */
export async function admitWaitlistedPlayers(
  db: SupabaseClient,
  bookingId: string,
  opts?: { via?: RsvpLogVia; actorEmail?: string | null },
): Promise<number> {
  const capacity = await getTotalCapacity(db, bookingId);
  const withAt = await waitlistedAtColumnExists(db);
  const selectCols = withAt
    ? "id, player_id, created_at, updated_at, waitlisted_at"
    : "id, player_id, created_at, updated_at";

  const waitlisted = await fetchAllRows<WaitlistRow & { player_id: string }>(
    (from, to) =>
      db
        .from("booking_attendance")
        .select(selectCols)
        .eq("booking_id", bookingId)
        .eq("response_status", "waitlist")
        .order("id")
        .range(from, to),
  );

  if (waitlisted.length === 0) return 0;

  let slots = waitlisted.length;
  if (capacity > 0) {
    const going = await getGoingCount(db, bookingId);
    slots = capacity - going;
  }
  const promote = pickWaitlistToAdmit(waitlisted, slots);
  if (promote.length === 0) return 0;

  const ids = promote.map((r) => r.id).filter((id): id is string => Boolean(id));
  const { error } = await db
    .from("booking_attendance")
    .update({
      response_status: "going" as ResponseStatus,
      ...(withAt ? { waitlisted_at: null } : {}),
    })
    .in("id", ids);
  if (error) return 0;

  const { data: booking } = await db
    .from("bookings")
    .select("booking_code")
    .eq("id", bookingId)
    .single();
  const { data: promoted } = await db
    .from("booking_attendance")
    .select("player_id, players(name)")
    .in("id", ids);

  for (const row of (promoted ?? []) as unknown as {
    player_id: string;
    players: { name: string } | null;
  }[]) {
    await logRsvpChange({
      playerId: row.player_id,
      bookingId,
      playerName: row.players?.name ?? null,
      bookingCode: booking?.booking_code ?? null,
      from: "waitlist",
      to: "going",
      actorEmail: opts?.actorEmail ?? null,
      via: opts?.via ?? "admin",
    });
  }

  return ids.length;
}
