import { describe, expect, it } from "vitest";
import { round2, splitByUnits, allocateBookingShareAmounts } from "./ledger";

describe("round2", () => {
  it("rounds to two decimal places", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10 / 3)).toBe(3.33);
  });
});

describe("splitByUnits", () => {
  it("splits evenly when all units are equal", () => {
    const rows = [
      { share_units: 1, override_share_amount: null },
      { share_units: 1, override_share_amount: null },
      { share_units: 1, override_share_amount: null },
    ];
    const result = splitByUnits(rows, 300);
    expect(result.map((r) => r.amount)).toEqual([100, 100, 100]);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(300);
  });

  it("assigns rounding remainder to the last auto row", () => {
    const rows = [
      { share_units: 1, override_share_amount: null },
      { share_units: 1, override_share_amount: null },
      { share_units: 1, override_share_amount: null },
    ];
    const result = splitByUnits(rows, 100);
    const amounts = result.map((r) => r.amount);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(amounts[2]).toBe(round2(100 - amounts[0] - amounts[1]));
  });

  it("respects override amounts before splitting the remainder", () => {
    const rows = [
      { share_units: 1, override_share_amount: 50 },
      { share_units: 1, override_share_amount: null },
      { share_units: 1, override_share_amount: null },
    ];
    const result = splitByUnits(rows, 200);
    const override = result.find((r) => r.row.override_share_amount === 50);
    expect(override?.amount).toBe(50);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(200);
  });

  it("returns zero amounts when total units are zero", () => {
    const rows = [{ share_units: 0, override_share_amount: null }];
    const result = splitByUnits(rows, 100);
    expect(result[0].amount).toBe(0);
  });
});

describe("allocateBookingShareAmounts", () => {
  it("splits the full court among seats and adds late-cancel penalty on top", () => {
    const rows = [
      { player_id: "a", share_units: 1, override_share_amount: null },
      { player_id: "b", share_units: 1, override_share_amount: null },
      { player_id: "late", share_units: 0, override_share_amount: 50 },
    ];
    const result = allocateBookingShareAmounts(rows, 200, new Set(["late"]));
    const byId = Object.fromEntries(result.map((r) => [r.row.player_id, r.amount]));
    expect(byId.a).toBe(100);
    expect(byId.b).toBe(100);
    expect(byId.late).toBe(50);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(250);
  });

  it("skips late cancel when there is no penalty override", () => {
    const rows = [
      { player_id: "a", share_units: 1, override_share_amount: null },
      { player_id: "late", share_units: 0, override_share_amount: null },
    ];
    const result = allocateBookingShareAmounts(rows, 100, new Set(["late"]));
    expect(result).toHaveLength(1);
    expect(result[0].row.player_id).toBe("a");
    expect(result[0].amount).toBe(100);
  });

  it("still takes seat overrides out of the court total", () => {
    const rows = [
      { player_id: "a", share_units: 1, override_share_amount: 40 },
      { player_id: "b", share_units: 1, override_share_amount: null },
      { player_id: "late", share_units: 0, override_share_amount: 25 },
    ];
    const result = allocateBookingShareAmounts(rows, 100, new Set(["late"]));
    const byId = Object.fromEntries(result.map((r) => [r.row.player_id, r.amount]));
    expect(byId.a).toBe(40);
    expect(byId.b).toBe(60);
    expect(byId.late).toBe(25);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBe(125);
  });
});
