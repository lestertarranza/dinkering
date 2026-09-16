import { describe, expect, it } from "vitest";
import {
  inviteLine,
  inviteLineFromIndex,
  inviteSelectValue,
  parseInviteChoice,
  type InviteIndex,
} from "./player-invite";

describe("parseInviteChoice", () => {
  it("marks founding members", () => {
    expect(parseInviteChoice("founding")).toEqual({
      isFoundingMember: true,
      invitedByPlayerId: null,
    });
  });

  it("stores an inviter id", () => {
    const id = "3d5d7d0a-1111-4111-8111-aaaaaaaaaaaa";
    expect(parseInviteChoice(id)).toEqual({
      isFoundingMember: false,
      invitedByPlayerId: id,
    });
  });

  it("treats blank as unset", () => {
    expect(parseInviteChoice("")).toEqual({
      isFoundingMember: false,
      invitedByPlayerId: null,
    });
  });
});

describe("inviteLine", () => {
  it("labels founding members", () => {
    expect(
      inviteLine({ isFoundingMember: true, invitedByPlayerId: null }, null),
    ).toBe("Founding member");
  });

  it("names the inviter", () => {
    expect(
      inviteLine(
        {
          isFoundingMember: false,
          invitedByPlayerId: "p1",
        },
        "Lester Tarranza",
      ),
    ).toBe("Invited by Lester Tarranza");
  });
});

describe("inviteLineFromIndex", () => {
  it("uses the claimed full name of the inviter", () => {
    const index: InviteIndex = {
      ready: true,
      byId: new Map([
        [
          "new",
          { isFoundingMember: false, invitedByPlayerId: "host" },
        ],
      ]),
      players: new Map([
        ["host", { name: "Lester Tarranza", display_name: "Les", active_status: "active" }],
      ]),
    };
    expect(
      inviteLineFromIndex(
        "new",
        index,
        new Map([
          [
            "host",
            {
              avatarUrl: null,
              firstName: "Lester",
              lastName: "Tarranza",
            },
          ],
        ]),
      ),
    ).toBe("Invited by Lester Tarranza");
  });
});

describe("inviteSelectValue", () => {
  it("round-trips founding", () => {
    expect(
      inviteSelectValue({ isFoundingMember: true, invitedByPlayerId: null }),
    ).toBe("founding");
  });
});
