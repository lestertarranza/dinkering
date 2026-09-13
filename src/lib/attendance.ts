import type { ActualStatus } from "@/lib/types";

/** Players who used a court seat and split the booking cost equally. */
export const COURT_SEAT_ACTUAL = new Set<ActualStatus>(["attended", "guest"]);

export function isCourtSeatActual(
  actual: string | null | undefined,
): actual is "attended" | "guest" {
  return !!actual && COURT_SEAT_ACTUAL.has(actual as ActualStatus);
}

export function isLateCancelActual(
  actual: string | null | undefined,
): actual is "late_cancel" {
  return actual === "late_cancel";
}

/** Equal court split: confirmed seats, or Going if attendance is not set yet. */
export function inEqualCourtSplit(r: {
  actual_status?: string | null;
  response_status?: string | null;
}): boolean {
  if (r.actual_status) return isCourtSeatActual(r.actual_status);
  return r.response_status === "going";
}

export function lateCancelPlayerIds(
  roster: { player_id: string; actual_status?: string | null }[],
): Set<string> {
  return new Set(
    roster.filter((r) => isLateCancelActual(r.actual_status)).map((r) => r.player_id),
  );
}
