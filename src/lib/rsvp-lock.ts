export const RSVP_LOCK_HOURS = 24;
const PH_OFFSET = "+08:00";

type CourtTime = { start_time: string | null };

/** Normalize HH:MM or HH:MM:SS to HH:MM:SS for Date parsing. */
function normalizeTime(t: string): string {
  const parts = t.trim().split(":");
  const h = (parts[0] ?? "00").padStart(2, "0");
  const m = (parts[1] ?? "00").padStart(2, "0");
  const s = (parts[2] ?? "00").padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function earliestStart(courts: CourtTime[], fallbackStart: string | null): string {
  const starts = courts.map((c) => c.start_time).filter(Boolean) as string[];
  if (starts.length > 0) {
    return starts.reduce((a, b) => (a < b ? a : b));
  }
  if (fallbackStart) return fallbackStart;
  return "00:00";
}

/** Game start = earliest court start (fallback legacy booking start, then midnight) in PH time. */
export function getBookingStart(
  playDate: string,
  courts: CourtTime[],
  fallbackStart: string | null,
): Date | null {
  if (!playDate) return null;
  const time = normalizeTime(earliestStart(courts, fallbackStart));
  const d = new Date(`${playDate}T${time}${PH_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lock cutoff = game start minus RSVP_LOCK_HOURS. */
export function getRsvpLockAt(
  playDate: string,
  courts: CourtTime[],
  fallbackStart: string | null,
): Date | null {
  const start = getBookingStart(playDate, courts, fallbackStart);
  if (!start) return null;
  return new Date(start.getTime() - RSVP_LOCK_HOURS * 60 * 60 * 1000);
}

/** True when now is at or past the lock cutoff for this booking. */
export function isRsvpLocked(
  playDate: string,
  courts: CourtTime[],
  fallbackStart: string | null,
  now = Date.now(),
): boolean {
  const at = getRsvpLockAt(playDate, courts, fallbackStart);
  return at != null && now >= at.getTime();
}
