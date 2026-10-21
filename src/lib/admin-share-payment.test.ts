import { describe, expect, it } from "vitest";
import { planAdminSharePayments } from "./admin-share-payment";

describe("planAdminSharePayments", () => {
  it("adds court and club remainders for the same admin wallet", () => {
    const plan = planAdminSharePayments([
      {
        playerId: "lester",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        remaining: 183.92,
      },
      {
        playerId: "lester",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        remaining: 16.08,
      },
      {
        playerId: "donna",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        remaining: 183.92,
      },
      {
        playerId: "donna",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        remaining: 16.08,
      },
    ]);
    expect(plan).toEqual([
      {
        playerId: "lester",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        amount: 200,
      },
      {
        playerId: "donna",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        amount: 200,
      },
    ]);
  });

  it("skips a remainder inside the settle tolerance", () => {
    expect(
      planAdminSharePayments([
        {
          playerId: "lester",
          walletPlayerId: "lester",
          walletGroupId: null,
          remaining: 0.2,
        },
      ]),
    ).toEqual([]);
  });

  it("keeps a personal wallet separate from the couple wallet", () => {
    const plan = planAdminSharePayments([
      {
        playerId: "lester",
        walletPlayerId: "lester",
        walletGroupId: null,
        remaining: 50,
      },
      {
        playerId: "lester",
        walletPlayerId: null,
        walletGroupId: "tarranzas",
        remaining: 25,
      },
    ]);
    expect(plan.map((row) => row.amount)).toEqual([50, 25]);
    expect(plan[0].walletPlayerId).toBe("lester");
    expect(plan[1].walletGroupId).toBe("tarranzas");
  });
});
