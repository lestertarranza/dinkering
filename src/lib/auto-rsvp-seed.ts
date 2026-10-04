import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/account-fields";
import { logRsvpChange } from "@/lib/activity-log";
import {
  autoGoingFromRoster,
  buildNewBookingAttendanceRows,
  playerIdsForDuplicatedRoster,
} from "@/lib/auto-rsvp";

export type RosterPlayer = {
  id: string;
  name?: string | null;
  auto_rsvp_going?: boolean | null;
};

export async function loadActiveRosterPlayers(
  db: SupabaseClient,
): Promise<RosterPlayer[]> {
  const withFlag = await db
    .from("players")
    .select("id, name, auto_rsvp_going")
    .eq("active_status", "active");
  if (!withFlag.error) {
    return ((withFlag.data ?? []) as RosterPlayer[]).map((p) => ({
      id: p.id,
      name: p.name,
      auto_rsvp_going: !!p.auto_rsvp_going,
    }));
  }
  if (!isMissingRelation(withFlag.error)) return [];
  const { data } = await db
    .from("players")
    .select("id, name")
    .eq("active_status", "active");
  const rows = ((data ?? []) as RosterPlayer[]).map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const autoIds = new Set(autoGoingFromRoster(rows, false));
  return rows.map((p) => ({
    ...p,
    auto_rsvp_going: autoIds.has(p.id),
  }));
}

/**
 * Put players on a new booking. Hosts with auto_rsvp_going start as Going
 * and are logged as Automatic. Duplicate can pass the source roster ids.
 */
export async function seedNewBookingAttendance(
  db: SupabaseClient,
  opts: {
    bookingId: string;
    bookingCode?: string | null;
    sourcePlayerIds?: string[];
  },
): Promise<void> {
  const active = await loadActiveRosterPlayers(db);
  const autoGoingIds = active.filter((p) => p.auto_rsvp_going).map((p) => p.id);
  const playerIds =
    opts.sourcePlayerIds !== undefined
      ? playerIdsForDuplicatedRoster(opts.sourcePlayerIds, autoGoingIds)
      : active.map((p) => p.id);
  const rows = buildNewBookingAttendanceRows(
    opts.bookingId,
    playerIds,
    autoGoingIds,
  );
  if (rows.length > 0) {
    await db.from("booking_attendance").upsert(rows, {
      onConflict: "booking_id,player_id",
      ignoreDuplicates: true,
    });
  }
  if (autoGoingIds.length > 0) {
    await db
      .from("booking_attendance")
      .update({ hold_waived: true })
      .eq("booking_id", opts.bookingId)
      .in("player_id", autoGoingIds);
  }
  const nameById = new Map(active.map((p) => [p.id, p.name ?? null]));
  const onRoster = new Set(playerIds);
  for (const id of autoGoingIds) {
    if (!onRoster.has(id)) continue;
    await logRsvpChange({
      playerId: id,
      bookingId: opts.bookingId,
      playerName: nameById.get(id) ?? null,
      bookingCode: opts.bookingCode ?? null,
      from: "no_response",
      to: "going",
      via: "auto_going",
    });
  }
}
