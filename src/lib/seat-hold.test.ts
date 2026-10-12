import { describe, expect, it } from "vitest";
import {
  availableCredit,
  defaultLateCancelCharge,
  MIN_HOLD_FEE,
  parseHoldFee,
  seatHoldBlockReason,
  seatHoldMoveProblem,
  seatHoldMoveSummary,
} from "./seat-hold";

describe("parseHoldFee", () => {
  it("accepts the default and rejects anything under 200", () => {
    expect(parseHoldFee("200")).toEqual({ ok: true, fee: 200 });
    expect(parseHoldFee("250")).toEqual({ ok: true, fee: 250 });
    expect(parseHoldFee("199").ok).toBe(false);
    expect(parseHoldFee("").ok).toBe(false);
  });
});

describe("seatHoldBlockReason", () => {
  it("blocks an owed wallet and names the minimum hold", () => {
    const message = seatHoldBlockReason({
      balance: 40,
      holdFee: MIN_HOLD_FEE,
      alreadyHeld: false,
      sharedWallet: false,
    });
    expect(message).toContain("settle");
    expect(message).toContain("₱200");
  });

  it("blocks when court credit is short", () => {
    const message = seatHoldBlockReason({
      balance: -50,
      holdFee: 200,
      alreadyHeld: false,
      sharedWallet: false,
    });
    expect(message).toContain("₱50.00");
    expect(message).toContain("₱200.00");
  });

  it("allows a wallet that can cover the hold", () => {
    expect(
      seatHoldBlockReason({
        balance: -200,
        holdFee: 200,
        alreadyHeld: false,
        sharedWallet: false,
      }),
    ).toBeNull();
  });

  it("does not ask twice when the seat is already held", () => {
    expect(
      seatHoldBlockReason({
        balance: 10,
        holdFee: 200,
        alreadyHeld: true,
        sharedWallet: true,
      }),
    ).toBeNull();
  });
});

describe("availableCredit", () => {
  it("reads credit from a negative balance", () => {
    expect(availableCredit(-200)).toBe(200);
    expect(availableCredit(20)).toBe(0);
  });
});

describe("seatHoldMoveProblem", () => {
  const base = {
    holdStatus: "open",
    sourceBookingId: "src",
    destBookingId: "dest",
    destBookingStatus: "played",
    destHoldStatus: null as string | null,
  };

  it("allows an open hold onto a played game with no hold there", () => {
    expect(seatHoldMoveProblem(base)).toBeNull();
  });

  it("refuses a hold that is not open, the same game, or a cancelled game", () => {
    expect(seatHoldMoveProblem({ ...base, holdStatus: "applied" })).toMatch(/open/);
    expect(seatHoldMoveProblem({ ...base, destBookingId: "src" })).toMatch(/different/);
    expect(
      seatHoldMoveProblem({ ...base, destBookingStatus: "cancelled" }),
    ).toMatch(/cancelled/);
  });

  it("refuses when the destination already has a hold for this player", () => {
    expect(seatHoldMoveProblem({ ...base, destHoldStatus: "open" })).toMatch(/open hold/);
    expect(seatHoldMoveProblem({ ...base, destHoldStatus: "applied" })).toMatch(/already used/);
    expect(seatHoldMoveProblem({ ...base, destHoldStatus: "returned" })).toMatch(/hold record/);
  });
});

describe("seatHoldMoveSummary", () => {
  it("says the hold was applied when the destination already charged them", () => {
    expect(
      seatHoldMoveSummary({
        playerName: "Ian Keith Clarion",
        amount: 200,
        sourceCode: "PB-060",
        destCode: "PB-054",
        applied: true,
      }),
    ).toBe(
      "Moved Ian Keith Clarion's ₱200.00 seat hold from PB-060 to PB-054. Applied it to their share on PB-054.",
    );
  });
});

describe("defaultLateCancelCharge", () => {
  it("uses one seat of the court split", () => {
    expect(defaultLateCancelCharge(800, 4)).toBe(200);
    expect(defaultLateCancelCharge(800, 0)).toBe(0);
  });
});
