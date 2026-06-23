import { describe, expect, it } from "vitest";
import { planBulkAllocation, totalOpenDue } from "./payment-allocation-plan";
import type { OpenCharge } from "./payment-allocation";

const charge = (
  id: string,
  date: string,
  remaining: number,
  label: string,
): OpenCharge => ({
  source_type: "booking_share",
  source_id: id,
  entry_date: date,
  label,
  booking_id: id,
  team_expense_id: null,
  remaining,
});

describe("planBulkAllocation", () => {
  it("allocates oldest charges first", () => {
    const open = [
      charge("a", "2026-01-01", 100, "Game A"),
      charge("b", "2026-02-01", 50, "Game B"),
    ];
    const lines = planBulkAllocation(open, 120);
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(100);
    expect(lines[1].amount).toBe(20);
    expect(lines[1].charge?.source_id).toBe("b");
  });

  it("creates advance line for overpayment", () => {
    const open = [charge("a", "2026-01-01", 50, "Game A")];
    const lines = planBulkAllocation(open, 80);
    expect(lines).toHaveLength(2);
    expect(lines[0].kind).toBe("charge");
    expect(lines[0].amount).toBe(50);
    expect(lines[1].kind).toBe("advance");
    expect(lines[1].amount).toBe(30);
  });

  it("returns single advance when nothing is owed", () => {
    const lines = planBulkAllocation([], 100);
    expect(lines).toEqual([{ charge: null, amount: 100, kind: "advance" }]);
  });
});

describe("totalOpenDue", () => {
  it("sums remaining on open charges", () => {
    expect(
      totalOpenDue([
        charge("a", "2026-01-01", 100, "A"),
        charge("b", "2026-02-01", 25.5, "B"),
      ]),
    ).toBe(125.5);
  });
});
