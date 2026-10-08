import { describe, expect, it } from "vitest";
import {
  groupRsvpGrantOn,
  type GroupRsvpContext,
} from "./group-rsvp";

const jerolyn = "jerolyn";
const zamie = "zamie";
const outsider = "outsider";
const jozams = "jozams";
const other = "other";

function ctx(opts?: {
  membersCanRsvp?: boolean;
  otherFlag?: boolean;
  zamieOtherPrimary?: boolean;
}): GroupRsvpContext {
  return {
    groups: new Map([
      [
        jozams,
        {
          id: jozams,
          name: "The JoZams",
          pooled: true,
          membersCanRsvp: opts?.membersCanRsvp ?? true,
        },
      ],
      [
        other,
        {
          id: other,
          name: "Other fund",
          pooled: true,
          membersCanRsvp: opts?.otherFlag ?? false,
        },
      ],
    ]),
    memberships: [
      {
        playerId: jerolyn,
        groupId: jozams,
        isPrimary: true,
        start: "2026-06-25",
        end: null,
      },
      {
        playerId: zamie,
        groupId: jozams,
        isPrimary: false,
        start: "2026-06-25",
        end: null,
      },
      ...(opts?.zamieOtherPrimary
        ? [
            {
              playerId: zamie,
              groupId: other,
              isPrimary: true,
              start: "2026-01-01",
              end: null,
            },
          ]
        : []),
    ],
  };
}

describe("groupRsvpGrantOn", () => {
  const onDate = "2026-10-07";

  it("lets a member RSVP for another member when the shared wallet allows it", () => {
    expect(groupRsvpGrantOn(ctx(), jerolyn, zamie, onDate)).toEqual({
      groupId: jozams,
      groupName: "The JoZams",
    });
  });

  it("stays off until the group checkbox is on", () => {
    expect(
      groupRsvpGrantOn(ctx({ membersCanRsvp: false }), jerolyn, zamie, onDate),
    ).toBeNull();
  });

  it("does not let a player RSVP for themself through the group rule", () => {
    expect(groupRsvpGrantOn(ctx(), zamie, zamie, onDate)).toBeNull();
  });

  it("does not let someone outside the wallet group RSVP", () => {
    expect(groupRsvpGrantOn(ctx(), outsider, zamie, onDate)).toBeNull();
  });

  it("follows the wallet the target is actually charged on", () => {
    expect(
      groupRsvpGrantOn(ctx({ zamieOtherPrimary: true }), jerolyn, zamie, onDate),
    ).toBeNull();
  });

  it("ignores a membership that has not started or has already ended", () => {
    const ended = ctx();
    ended.memberships = ended.memberships.map((m) =>
      m.playerId === jerolyn ? { ...m, end: "2026-10-01" } : m,
    );
    expect(groupRsvpGrantOn(ended, jerolyn, zamie, onDate)).toBeNull();
  });
});
