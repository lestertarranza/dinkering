import { describe, expect, it } from "vitest";
import {
  compareWaitlistOrder,
  pickWaitlistToAdmit,
  waitlistJoinedAt,
  waitlistPositionOf,
  waitlistedAtPayload,
} from "./waitlist-order";

describe("waitlistedAtPayload", () => {
  const now = new Date("2026-09-16T00:00:00.000Z");

  it("stamps now when entering waitlist", () => {
    expect(waitlistedAtPayload("waitlist", "no_response", null, now)).toBe(
      now.toISOString(),
    );
  });

  it("keeps the original join time if they stay waitlisted", () => {
    expect(
      waitlistedAtPayload("waitlist", "waitlist", "2026-09-13T08:43:49.000Z", now),
    ).toBe("2026-09-13T08:43:49.000Z");
  });

  it("clears the stamp when leaving waitlist", () => {
    expect(
      waitlistedAtPayload("going", "waitlist", "2026-09-13T08:43:49.000Z", now),
    ).toBeNull();
    expect(waitlistedAtPayload("not_going", "going", null, now)).toBeNull();
  });
});

describe("waitlist FCFS order", () => {
  it("orders by waitlisted_at, not roster created_at", () => {
    const dave = {
      id: "b",
      created_at: "2026-09-10T00:00:00.000Z",
      waitlisted_at: "2026-09-07T00:00:00.000Z",
    };
    const nikko = {
      id: "a",
      created_at: "2026-08-23T00:00:00.000Z",
      waitlisted_at: "2026-09-08T00:00:00.000Z",
    };
    expect(waitlistJoinedAt(dave) < waitlistJoinedAt(nikko)).toBe(true);
    expect(compareWaitlistOrder(dave, nikko)).toBeLessThan(0);
    expect(pickWaitlistToAdmit([nikko, dave], 1).map((r) => r.id)).toEqual([
      "b",
    ]);
  });

  it("falls back to updated_at when waitlisted_at is missing", () => {
    const first = {
      id: "1",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-09-13T08:43:49.000Z",
    };
    const second = {
      id: "2",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-09-13T10:21:50.000Z",
    };
    expect(pickWaitlistToAdmit([second, first], 1)[0].id).toBe("1");
  });

  it("numbers positions in join order", () => {
    const rows = [
      {
        id: "2",
        player_id: "p2",
        waitlisted_at: "2026-09-13T10:00:00.000Z",
      },
      {
        id: "1",
        player_id: "p1",
        waitlisted_at: "2026-09-13T08:00:00.000Z",
      },
    ];
    expect(waitlistPositionOf(rows, "p1")).toEqual({ position: 1, total: 2 });
    expect(waitlistPositionOf(rows, "p2")).toEqual({ position: 2, total: 2 });
    expect(waitlistPositionOf(rows, "p9")).toBeNull();
  });
});
