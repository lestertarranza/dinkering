import { describe, expect, it } from "vitest";
import { canEditPublicRsvp } from "./rsvp-auth";

describe("canEditPublicRsvp", () => {
  it("lets anyone with the private link RSVP an unclaimed name", () => {
    expect(
      canEditPublicRsvp({
        claimed: false,
        viewerPlayerId: null,
        targetPlayerId: "p1",
      }),
    ).toBe(true);
    expect(
      canEditPublicRsvp({
        claimed: false,
        viewerPlayerId: "someone-else",
        targetPlayerId: "p1",
      }),
    ).toBe(true);
  });

  it("lets only the signed-in owner RSVP a claimed name", () => {
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: "p1",
        targetPlayerId: "p1",
      }),
    ).toBe(true);
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: null,
        targetPlayerId: "p1",
      }),
    ).toBe(false);
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: "admin-or-other",
        targetPlayerId: "p1",
      }),
    ).toBe(false);
  });

  it("lets a group member RSVP only when that permission was granted", () => {
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: "jerolyn",
        targetPlayerId: "zamie",
        groupMemberRsvp: true,
      }),
    ).toBe(true);
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: "jerolyn",
        targetPlayerId: "zamie",
        groupMemberRsvp: false,
      }),
    ).toBe(false);
  });

  it("lets a club admin act only for the player they are viewing as", () => {
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: "admin",
        targetPlayerId: "p1",
        adminViewAsPlayerId: "p1",
      }),
    ).toBe(true);
    expect(
      canEditPublicRsvp({
        claimed: true,
        viewerPlayerId: "admin",
        targetPlayerId: "p2",
        adminViewAsPlayerId: "p1",
      }),
    ).toBe(false);
  });
});
