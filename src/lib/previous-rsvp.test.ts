import { describe, expect, it } from "vitest";
import { groupPreviousSeats, previousWaitPosition } from "./previous-rsvp";

describe("groupPreviousSeats", () => {
  it("keeps Going names and the old waitlist order", () => {
    const grouped = groupPreviousSeats([
      {
        playerId: "w2",
        name: "Bea",
        previousStatus: "waitlist",
        previousWaitlistedAt: "2026-10-02T02:00:00Z",
      },
      {
        playerId: "g2",
        name: "Ana",
        previousStatus: "going",
        previousWaitlistedAt: null,
      },
      {
        playerId: "w1",
        name: "Cara",
        previousStatus: "waitlist",
        previousWaitlistedAt: "2026-10-01T02:00:00Z",
      },
      {
        playerId: "g1",
        name: "Bea",
        previousStatus: "going",
        previousWaitlistedAt: null,
      },
      {
        playerId: "n",
        name: "Dan",
        previousStatus: "not_going",
        previousWaitlistedAt: null,
      },
      {
        playerId: "x",
        name: "Eve",
        previousStatus: null,
        previousWaitlistedAt: null,
      },
    ]);

    expect(grouped.going.map((p) => p.name)).toEqual(["Ana", "Bea"]);
    expect(grouped.waitlist.map((p) => `${p.position}:${p.name}`)).toEqual([
      "1:Cara",
      "2:Bea",
    ]);
    expect(previousWaitPosition(grouped.waitlist, "w2")).toBe(2);
    expect(previousWaitPosition(grouped.waitlist, "g1")).toBeNull();
  });
});
