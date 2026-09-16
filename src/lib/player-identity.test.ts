import { describe, expect, it } from "vitest";
import { claimedFullName, playerFace, publicPlayerLabel } from "./player-identity";

const lester = {
  avatarUrl: null,
  firstName: "Lester",
  lastName: "Tarranza",
};

describe("claimedFullName", () => {
  it("uses first and last from the claimed login", () => {
    expect(claimedFullName("Lester", lester)).toBe("Lester Tarranza");
  });

  it("falls back to roster full name when last name is blank", () => {
    expect(
      claimedFullName("Lester Tarranza", {
        avatarUrl: null,
        firstName: "Lester",
        lastName: "",
      }),
    ).toBe("Lester Tarranza");
  });
});

describe("publicPlayerLabel", () => {
  it("uses nickname when unclaimed", () => {
    expect(
      publicPlayerLabel({ name: "Lester Tarranza", display_name: "Les" }),
    ).toBe("Les");
  });

  it("uses full claimed name, not nickname", () => {
    expect(
      publicPlayerLabel(
        { name: "Lester Tarranza", display_name: "Les" },
        lester,
      ),
    ).toBe("Lester Tarranza");
  });
});

describe("playerFace", () => {
  it("marks claimed players as verified with their full name", () => {
    const identities = new Map([["p1", lester]]);
    expect(
      playerFace(
        "p1",
        { name: "Lester Tarranza", display_name: "Les" },
        identities,
      ),
    ).toEqual({
      name: "Lester Tarranza",
      verified: true,
      avatarUrl: null,
    });
  });
});
