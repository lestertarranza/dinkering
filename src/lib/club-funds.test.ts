import { describe, expect, it } from "vitest";
import { fundBalanceFromEntries } from "./club-funds";

describe("fundBalanceFromEntries", () => {
  it("starts at zero", () => {
    expect(fundBalanceFromEntries([])).toBe(0);
  });

  it("adds allocations and subtracts spends", () => {
    expect(
      fundBalanceFromEntries([
        { kind: "allocate", amount: 2000 },
        { kind: "allocate", amount: 500 },
        { kind: "spend", amount: 1200 },
      ]),
    ).toBe(1300);
  });

  it("ignores voided rows", () => {
    expect(
      fundBalanceFromEntries([
        { kind: "allocate", amount: 1000 },
        { kind: "spend", amount: 400, voided: true },
      ]),
    ).toBe(1000);
  });
});
