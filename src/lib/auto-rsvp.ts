import type { ResponseStatus } from "@/lib/types";

/** Club admins who may use Auto Going. Lester, then Donna Tarranza. */
export const DEFAULT_AUTO_GOING_PLAYER_IDS = [
  "5a96e0ad-9645-49f9-924c-3598f0c49800",
  "469aacc2-4449-44dc-9f93-897cb600b702",
] as const;

export function canBeAutoGoing(playerId: string): boolean {
  return (DEFAULT_AUTO_GOING_PLAYER_IDS as readonly string[]).includes(playerId);
}

export function showsAutoRsvpGoing(player: {
  id: string;
  auto_rsvp_going?: boolean | null;
}): boolean {
  if (!canBeAutoGoing(player.id)) return false;
  if (typeof player.auto_rsvp_going === "boolean") return player.auto_rsvp_going;
  return true;
}

export function autoGoingFromRoster(
  players: { id: string; auto_rsvp_going?: boolean | null }[],
  columnSupported: boolean,
): string[] {
  if (!columnSupported) {
    const present = new Set(players.map((p) => p.id));
    return DEFAULT_AUTO_GOING_PLAYER_IDS.filter((id) => present.has(id));
  }
  return players
    .filter((p) => canBeAutoGoing(p.id) && p.auto_rsvp_going)
    .map((p) => p.id);
}

export function rosterStatus(
  autoRsvpGoing: boolean | null | undefined,
): ResponseStatus {
  return autoRsvpGoing ? "going" : "no_response";
}

export function playerIdsForDuplicatedRoster(
  sourcePlayerIds: string[],
  autoGoingPlayerIds: string[],
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of [...sourcePlayerIds, ...autoGoingPlayerIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function buildNewBookingAttendanceRows(
  bookingId: string,
  playerIds: string[],
  autoGoingPlayerIds: Iterable<string>,
): {
  booking_id: string;
  player_id: string;
  response_status: ResponseStatus;
}[] {
  const autoSet = new Set(autoGoingPlayerIds);
  return playerIds.map((player_id) => ({
    booking_id: bookingId,
    player_id,
    response_status: rosterStatus(autoSet.has(player_id)),
  }));
}
