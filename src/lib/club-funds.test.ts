import { describe, expect, it } from "vitest";
import { fundBalanceFromEntries, fundCashAvailable } from "./club-funds";

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

  it("goes negative when a purchase exceeds the pot", () => {
    expect(
      fundBalanceFromEntries([
        { kind: "allocate", amount: 240 },
        { kind: "spend", amount: 1200 },
      ]),
    ).toBe(-960);
  });
});

describe("fundCashAvailable", () => {
  it("counts collected contributions and donations, not billed charges", () => {
    expect(
      fundCashAvailable({
        billed: 240,
        collected: 80,
        unpaid: 160,
        manualIn: 500,
        spent: 200,
      }),
    ).toBe(380);
  });

  it("goes overdrawn when purchases exceed collected cash", () => {
    expect(
      fundCashAvailable({
        billed: 240,
        collected: 0,
        unpaid: 240,
        manualIn: 0,
        spent: 1200,
      }),
    ).toBe(-1200);
  });
});
