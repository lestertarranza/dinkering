import type { SupabaseClient } from "@supabase/supabase-js";
import { goingChipLabel } from "@/lib/public-display";

export type GoingWaitRow = {
  booking_id: string;
  player_id: string;
  response_status: string;
  created_at: string;
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
  const pageSize = 1000;
  const all: GoingWaitRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = await db
      .from("booking_attendance")
      .select(
        "booking_id, player_id, response_status, created_at, players(name, display_name, hidden_on_board)",
      )
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
  const wait = rows
    .filter(
      (r) => r.booking_id === bookingId && r.response_status === "waitlist",
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const idx = wait.findIndex((r) => r.player_id === playerId);
  if (idx === -1) return null;
  return { position: idx + 1, total: wait.length };
}
