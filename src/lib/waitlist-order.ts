import type { ResponseStatus } from "@/lib/types";

export type WaitlistRow = {
  id?: string;
  player_id?: string;
  waitlisted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * When the player joined the waitlist. Prefer waitlisted_at (join stamp).
 * Fall back to updated_at (RSVP change), never roster created_at.
 */
export function waitlistJoinedAt(row: WaitlistRow): string {
  return row.waitlisted_at || row.updated_at || row.created_at || "";
}

export function compareWaitlistOrder(a: WaitlistRow, b: WaitlistRow): number {
  const byJoin = waitlistJoinedAt(a).localeCompare(waitlistJoinedAt(b));
  if (byJoin !== 0) return byJoin;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

/** Stamp join time when entering waitlist; keep it while they stay there. */
export function waitlistedAtPayload(
  next: ResponseStatus,
  prev: ResponseStatus | null | undefined,
  prevWaitlistedAt: string | null | undefined,
  now = new Date(),
): string | null {
  if (next !== "waitlist") return null;
  if (prev === "waitlist" && prevWaitlistedAt) return prevWaitlistedAt;
  return now.toISOString();
}

export function pickWaitlistToAdmit<T extends WaitlistRow>(
  waitlisted: T[],
  slots: number,
): T[] {
  if (slots <= 0 || waitlisted.length === 0) return [];
  return [...waitlisted].sort(compareWaitlistOrder).slice(0, slots);
}

export function waitlistPositionOf<T extends WaitlistRow & { player_id: string }>(
  rows: T[],
  playerId: string,
): { position: number; total: number } | null {
  const wait = [...rows].sort(compareWaitlistOrder);
  const idx = wait.findIndex((r) => r.player_id === playerId);
  if (idx === -1) return null;
  return { position: idx + 1, total: wait.length };
}
