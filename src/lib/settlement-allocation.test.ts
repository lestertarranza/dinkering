import { describe, expect, it } from "vitest";
import { computeWalletAllocations, type AllocRow } from "./settlement-allocation";

let seq = 0;
const charge = (
  source_id: string,
  entry_date: string,
  amount: number,
  source_type: AllocRow["source_type"] = "team_expense_share",
): AllocRow => ({
  entry_date,
  created_at: `${entry_date}T00:00:${String(seq++).padStart(2, "0")}Z`,
  source_type,
  source_id,
  debit_amount: amount,
  credit_amount: 0,
});

const credit = (
  source_id: string,
  entry_date: string,
  amount: number,
  source_type: AllocRow["source_type"] = "payment",
): AllocRow => ({
  entry_date,
  created_at: `${entry_date}T00:00:${String(seq++).padStart(2, "0")}Z`,
  source_type,
  source_id,
  debit_amount: 0,
  credit_amount: amount,
});

describe("computeWalletAllocations", () => {
  it("attributes a pre-existing credit to a later charge (auto-deduct)", () => {
    seq = 0;
    const allocs = computeWalletAllocations([
      credit("pay1", "2026-01-01", 500, "payment"),
      charge("share1", "2026-02-01", 200, "team_expense_share"),
    ]);
    expect(allocs).toHaveLength(1);
    expect(allocs[0]).toMatchObject({
      charge_source_id: "share1",
      funding_source_type: "payment",
      funding_source_id: "pay1",
      amount: 200,
    });
  });

  it("splits one charge across two credit lots (FIFO)", () => {
    seq = 0;
    const allocs = computeWalletAllocations([
      credit("buyer", "2026-01-01", 80, "team_expense_credit"),
      credit("pay1", "2026-01-05", 50, "payment"),
      charge("share1", "2026-02-01", 100, "team_expense_share"),
    ]);
    expect(allocs).toHaveLength(2);
    expect(allocs[0]).toMatchObject({
      funding_source_id: "buyer",
      funding_source_type: "team_expense_credit",
      amount: 80,
    });
    expect(allocs[1]).toMatchObject({
      funding_source_id: "pay1",
      amount: 20,
    });
  });

  it("leaves an unfunded charge with no allocation", () => {
    seq = 0;
    const allocs = computeWalletAllocations([
      charge("share1", "2026-02-01", 100, "team_expense_share"),
      credit("pay1", "2026-02-02", 40, "payment"),
    ]);
    expect(allocs).toHaveLength(1);
    expect(allocs[0].amount).toBe(40);
  });

  it("applies oldest charge first when credit is limited", () => {
    seq = 0;
    const allocs = computeWalletAllocations([
      charge("court", "2026-01-01", 100, "booking_share"),
      charge("exp", "2026-02-01", 100, "team_expense_share"),
      credit("pay1", "2026-03-01", 120, "payment"),
    ]);
    // 100 to the older court charge, 20 to the expense charge.
    expect(allocs).toHaveLength(2);
    expect(allocs[0]).toMatchObject({ charge_source_id: "court", amount: 100 });
    expect(allocs[1]).toMatchObject({ charge_source_id: "exp", amount: 20 });
  });

  it("ignores leftover (unapplied) credit", () => {
    seq = 0;
    const allocs = computeWalletAllocations([
      credit("pay1", "2026-01-01", 500, "payment"),
      charge("share1", "2026-02-01", 100, "team_expense_share"),
    ]);
    const total = allocs.reduce((s, a) => s + a.amount, 0);
    expect(total).toBe(100);
  });
});
