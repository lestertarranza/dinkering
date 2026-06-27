import { describe, expect, it } from "vitest";
import {
  getBookingStart,
  getRsvpLockAt,
  isRsvpLocked,
  RSVP_LOCK_HOURS,
} from "./rsvp-lock";

describe("getBookingStart", () => {
  it("uses earliest court start across multiple courts", () => {
    const start = getBookingStart(
      "2026-07-01",
      [{ start_time: "14:00" }, { start_time: "10:00" }, { start_time: "12:00" }],
      null,
    );
    expect(start?.toISOString()).toBe("2026-07-01T02:00:00.000Z"); // 10:00 +08
  });

  it("falls back to legacy booking start_time when courts have no start", () => {
    const start = getBookingStart(
      "2026-07-01",
      [{ start_time: null }],
      "16:30",
    );
    expect(start?.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("falls back to midnight when no court or booking start", () => {
    const start = getBookingStart("2026-07-01", [], null);
    expect(start?.toISOString()).toBe("2026-06-30T16:00:00.000Z"); // 00:00 +08
  });
});

describe("getRsvpLockAt / isRsvpLocked", () => {
  const playDate = "2026-07-01";
  const courts = [{ start_time: "18:00" }];

  it("locks at exactly 24h before game start (boundary inclusive)", () => {
    const lockAt = getRsvpLockAt(playDate, courts, null);
    expect(lockAt?.toISOString()).toBe("2026-06-30T10:00:00.000Z"); // 18:00 +08 − 24h

    const cutoff = lockAt!.getTime();
    expect(isRsvpLocked(playDate, courts, null, cutoff - 1)).toBe(false);
    expect(isRsvpLocked(playDate, courts, null, cutoff)).toBe(true);
    expect(isRsvpLocked(playDate, courts, null, cutoff + 1)).toBe(true);
  });

  it("uses Asia/Manila offset regardless of server timezone semantics", () => {
    const start = getBookingStart(playDate, courts, null);
    expect(start?.toISOString()).toBe("2026-07-01T10:00:00.000Z");

    const lockAt = getRsvpLockAt(playDate, courts, null);
    expect(lockAt?.toISOString()).toBe("2026-06-30T10:00:00.000Z");
    expect(RSVP_LOCK_HOURS).toBe(24);
  });

  it("picks earliest court when staggered starts", () => {
    const staggered = [
      { start_time: "20:00" },
      { start_time: "09:30" },
      { start_time: "15:00" },
    ];
    const lockAt = getRsvpLockAt(playDate, staggered, null);
    // 09:30 +08 on Jul 1 → lock at 09:30 +08 on Jun 30
    expect(lockAt?.toISOString()).toBe("2026-06-30T01:30:00.000Z");
  });
});
