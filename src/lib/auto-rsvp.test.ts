import { describe, expect, it } from "vitest";
import {
  autoGoingFromRoster,
  buildNewBookingAttendanceRows,
  DEFAULT_AUTO_GOING_PLAYER_IDS,
  playerIdsForDuplicatedRoster,
  rosterStatus,
  showsAutoRsvpGoing,
} from "./auto-rsvp";

describe("rosterStatus", () => {
  it("starts auto hosts as Going and everyone else as no response", () => {
    expect(rosterStatus(true)).toBe("going");
    expect(rosterStatus(false)).toBe("no_response");
    expect(rosterStatus(null)).toBe("no_response");
  });
});

describe("playerIdsForDuplicatedRoster", () => {
  it("keeps the source roster and adds auto Going hosts", () => {
    expect(
      playerIdsForDuplicatedRoster(["a", "b", "a"], ["b", "host"]),
    ).toEqual(["a", "b", "host"]);
  });
});

describe("autoGoingFromRoster", () => {
  const lester = DEFAULT_AUTO_GOING_PLAYER_IDS[0];
  const donna = DEFAULT_AUTO_GOING_PLAYER_IDS[1];

  it("uses Lester and Donna until the column exists", () => {
    expect(
      autoGoingFromRoster(
        [
          { id: lester },
          { id: donna },
          { id: "other" },
        ],
        false,
      ),
    ).toEqual([lester, donna]);
  });

  it("shows Lester and Donna as auto Going before the column exists", () => {
    expect(showsAutoRsvpGoing({ id: lester })).toBe(true);
    expect(showsAutoRsvpGoing({ id: "other" })).toBe(false);
    expect(showsAutoRsvpGoing({ id: lester, auto_rsvp_going: false })).toBe(false);
  });

  it("uses the saved flag once the column exists, only for club admins", () => {
    expect(
      autoGoingFromRoster(
        [
          { id: lester, auto_rsvp_going: false },
          { id: donna, auto_rsvp_going: true },
          { id: "other", auto_rsvp_going: true },
        ],
        true,
      ),
    ).toEqual([donna]);
  });
});

describe("buildNewBookingAttendanceRows", () => {
  it("marks only auto Going ids as Going", () => {
    expect(
      buildNewBookingAttendanceRows("bk", ["a", "b", "c"], ["b"]),
    ).toEqual([
      { booking_id: "bk", player_id: "a", response_status: "no_response" },
      { booking_id: "bk", player_id: "b", response_status: "going" },
      { booking_id: "bk", player_id: "c", response_status: "no_response" },
    ]);
  });
});
