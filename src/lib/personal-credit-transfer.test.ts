import { describe, expect, it } from "vitest";
import { personalCreditTransferProblem } from "./personal-credit-transfer";

const source = "player-a";
const target = "player-b";

describe("personalCreditTransferProblem", () => {
  it("allows moving part of a personal credit", () => {
    expect(
      personalCreditTransferProblem({
        sourcePlayerId: source,
        targetPlayerId: target,
        amount: 50,
        sourceBalance: -200,
      }),
    ).toBeNull();
  });

  it("allows moving the full personal credit", () => {
    expect(
      personalCreditTransferProblem({
        sourcePlayerId: source,
        targetPlayerId: target,
        amount: 200,
        sourceBalance: -200,
      }),
    ).toBeNull();
  });

  it("blocks a transfer larger than the personal credit", () => {
    expect(
      personalCreditTransferProblem({
        sourcePlayerId: source,
        targetPlayerId: target,
        amount: 201,
        sourceBalance: -200,
      }),
    ).toMatch(/only has/);
  });

  it("blocks a player who owes or is settled", () => {
    expect(
      personalCreditTransferProblem({
        sourcePlayerId: source,
        targetPlayerId: target,
        amount: 10,
        sourceBalance: 40,
      }),
    ).toMatch(/only has/);
    expect(
      personalCreditTransferProblem({
        sourcePlayerId: source,
        targetPlayerId: target,
        amount: 10,
        sourceBalance: 0,
      }),
    ).toMatch(/only has/);
  });

  it("blocks sending credit to the same player", () => {
    expect(
      personalCreditTransferProblem({
        sourcePlayerId: source,
        targetPlayerId: source,
        amount: 50,
        sourceBalance: -200,
      }),
    ).toMatch(/different player/);
  });
});
