import type { SupabaseClient } from "@supabase/supabase-js";
import { goingChipLabel } from "@/lib/public-display";
import { waitlistPositionOf } from "@/lib/waitlist-order";
import { waitlistedAtColumnExists } from "@/lib/waitlist";

export type GoingWaitRow = {
  booking_id: string;
  player_id: string;
  response_status: string;
  created_at: string;
  updated_at: string;
  waitlisted_at?: string | null;
  players: {
    name: string;
    display_name: string | null;
    hidden_on_board: boolean | null;
  } | null;
};

/**
 * Going + waitlist rows for a set of bookings, paged past PostgREST's cap.
 */
export async function fetchGoingAndWaitlist(
  db: SupabaseClient,
  bookingIds: string[],
): Promise<GoingWaitRow[]> {
  if (bookingIds.length === 0) return [];
  const withAt = await waitlistedAtColumnExists(db);
  const cols = withAt
    ? "booking_id, player_id, response_status, created_at, updated_at, waitlisted_at, players(name, display_name, hidden_on_board)"
    : "booking_id, player_id, response_status, created_at, updated_at, players(name, display_name, hidden_on_board)";
  const pageSize = 1000;
  const all: GoingWaitRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await db
      .from("booking_attendance")
      .select(cols)
      .in("booking_id", bookingIds)
      .in("response_status", ["going", "waitlist"])
      .order("created_at")
      .range(from, from + pageSize - 1);
    const rows = (data ?? []) as unknown as GoingWaitRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

export function goingNamesForBooking(
  rows: GoingWaitRow[],
  bookingId: string,
): { names: string[]; hiddenCount: number; total: number } {
  const going = rows.filter(
    (r) => r.booking_id === bookingId && r.response_status === "going",
  );
  const names: string[] = [];
  let hiddenCount = 0;
  for (const r of going) {
    if (!r.players) continue;
    const chip = goingChipLabel(r.players);
    if (chip) names.push(chip);
    else hiddenCount += 1;
  }
  return { names, hiddenCount, total: going.length };
}

export function waitlistPosition(
  rows: GoingWaitRow[],
  bookingId: string,
  playerId: string,
): { position: number; total: number } | null {
  const wait = rows.filter(
    (r) => r.booking_id === bookingId && r.response_status === "waitlist",
  );
  return waitlistPositionOf(wait, playerId);
}
