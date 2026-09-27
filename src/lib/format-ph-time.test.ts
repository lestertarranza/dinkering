import { describe, expect, it } from "vitest";
import {
  addCalendarDaysYmd,
  formatDate,
  formatDateTime,
  phTodayYmd,
} from "./format";
import { activityOrigin, rsvpLogDetails } from "./activity-origin";

describe("phTodayYmd", () => {
  it("uses Asia/Manila, not UTC, around midnight PH", () => {
    // 1:00 AM PH on Sep 27 = Sep 26 17:00 UTC
    expect(phTodayYmd(new Date("2026-09-26T17:00:00.000Z"))).toBe("2026-09-27");
    // 11:00 PM PH on Sep 26 = Sep 26 15:00 UTC
    expect(phTodayYmd(new Date("2026-09-26T15:00:00.000Z"))).toBe("2026-09-26");
  });
});

describe("addCalendarDaysYmd", () => {
  it("adds days on the PH calendar", () => {
    expect(addCalendarDaysYmd("2026-09-26", 1)).toBe("2026-09-27");
    expect(addCalendarDaysYmd("2026-09-30", 7)).toBe("2026-10-07");
  });
});

describe("formatDateTime", () => {
  it("renders UTC instants in PH time", () => {
    const text = formatDateTime("2026-09-27T11:43:00.000Z");
    expect(text).toMatch(/Sep 27, 2026/);
    expect(text).toMatch(/7:43\s*PM/i);
  });
});

describe("formatDate", () => {
  it("keeps a club calendar date on the same day in PH", () => {
    expect(formatDate("2026-09-23")).toBe("Sep 23, 2026 (Wednesday)");
  });
});

describe("activityOrigin", () => {
  it("labels new waitlist fills as automatic", () => {
    expect(
      activityOrigin({
        action: "Jezel RSVP on PB-050: Waitlist → Going",
        details: rsvpLogDetails("auto"),
        actor_email: null,
      }),
    ).toEqual({ kind: "automatic", source: "waitlist" });
  });

  it("labels player and admin RSVPs as manual", () => {
    expect(
      activityOrigin({
        action: "Carl RSVP on PB-050: Going → Not going",
        details: rsvpLogDetails("player"),
        actor_email: "Carl",
      }),
    ).toEqual({ kind: "manual", source: "player page" });
    expect(
      activityOrigin({
        action: "Carl RSVP on PB-050: No response → Going",
        details: rsvpLogDetails("admin"),
        actor_email: "lestertarranza@gmail.com",
      }),
    ).toEqual({ kind: "manual", source: "admin" });
  });

  it("treats old court auto-fills (via admin, no actor) as automatic", () => {
    expect(
      activityOrigin({
        action: "Jezel RSVP on PB-050: Waitlist → Going",
        details: "via admin",
        actor_email: null,
      }),
    ).toEqual({ kind: "automatic", source: "waitlist" });
  });

  it("treats old admin waitlist overrides with an actor as manual", () => {
    expect(
      activityOrigin({
        action: "Jezel RSVP on PB-050: Waitlist → Going",
        details: "via admin",
        actor_email: "lestertarranza@gmail.com",
      }),
    ).toEqual({ kind: "manual", source: "admin" });
  });
});
