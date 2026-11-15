import { describe, expect, it } from "vitest";
import { courtSplitPreview, type CourtSplitRow } from "./court-split-preview";

function row(partial: Partial<CourtSplitRow> & Pick<CourtSplitRow, "playerId">): CourtSplitRow {
  return {
    name: partial.playerId,
    absent: false,
    lateCancel: false,
    included: true,
    units: 1,
    override: null,
    ...partial,
  };
}

describe("courtSplitPreview", () => {
  it("takes the default absent charge out before an equal split", () => {
    const preview = courtSplitPreview(4380, [
      row({ playerId: "a" }),
      row({ playerId: "b" }),
      row({ playerId: "gone", absent: true, units: 0, override: 100 }),
    ]);
    expect(preview.pool).toBe(4280);
    expect(preview.each).toBe(2140);
    expect(preview.absentCount).toBe(1);
    expect(preview.absentEach).toBe(100);
    expect(preview.absentTotal).toBe(100);
    expect(preview.seatNames).toEqual(["a", "b"]);
  });

  it("uses an overridden absent amount instead of the flat penalty", () => {
    const preview = courtSplitPreview(4380, [
      row({ playerId: "a" }),
      row({ playerId: "b" }),
      row({ playerId: "c" }),
      row({ playerId: "gone", absent: true, units: 0, override: 250 }),
    ]);
    expect(preview.pool).toBe(4130);
    expect(preview.each).toBeCloseTo(4130 / 3);
    expect(preview.absentEach).toBe(250);
    expect(preview.absentTotal).toBe(250);
  });

  it("sums different absent overrides and does not call them one rate", () => {
    const preview = courtSplitPreview(1000, [
      row({ playerId: "a" }),
      row({ playerId: "x", absent: true, units: 0, override: 100 }),
      row({ playerId: "y", absent: true, units: 0, override: 40 }),
    ]);
    expect(preview.pool).toBe(860);
    expect(preview.absentCount).toBe(2);
    expect(preview.absentEach).toBeNull();
    expect(preview.absentTotal).toBe(140);
  });

  it("ignores a cleared or zero absent override and an unchecked player", () => {
    const preview = courtSplitPreview(500, [
      row({ playerId: "a" }),
      row({ playerId: "b", included: false }),
      row({ playerId: "gone", absent: true, units: 0, override: null }),
      row({ playerId: "zero", absent: true, units: 0, override: 0 }),
    ]);
    expect(preview.pool).toBe(500);
    expect(preview.each).toBe(500);
    expect(preview.absentCount).toBe(0);
    expect(preview.seatNames).toEqual(["a"]);
  });

  it("does not pretend the split is equal when units differ", () => {
    const preview = courtSplitPreview(300, [
      row({ playerId: "a", units: 1 }),
      row({ playerId: "b", units: 2 }),
    ]);
    expect(preview.pool).toBe(300);
    expect(preview.each).toBeNull();
  });

  it("leaves a late-cancel override on top of the court cost", () => {
    const preview = courtSplitPreview(400, [
      row({ playerId: "a" }),
      row({ playerId: "b" }),
      row({ playerId: "late", lateCancel: true, units: 0, override: 200 }),
    ]);
    expect(preview.pool).toBe(400);
    expect(preview.each).toBe(200);
    expect(preview.absentCount).toBe(0);
    expect(preview.seatNames).toEqual(["a", "b"]);
  });
});
