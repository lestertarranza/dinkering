import { round2 } from "./ledger";

/** One roster row, as the share form will submit it. */
export type CourtSplitRow = {
  playerId: string;
  name: string;
  absent: boolean;
  lateCancel: boolean;
  included: boolean;
  units: number;
  /** Blank override is null. Zero is a real override for a seat, and no charge for an absent player. */
  override: number | null;
};

export type CourtSplitPreview = {
  totalCost: number;
  /** Court cost left for the players who used a seat. */
  pool: number;
  seatNames: string[];
  /** Set when every seat player gets the same amount. */
  each: number | null;
  absentCount: number;
  absentTotal: number;
  /** Set when every absent charge is the same amount. */
  absentEach: number | null;
};

function finiteNumber(value: number | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Absent charges only count when they are above zero, matching share generation. */
function absentCharge(value: number | null): number | null {
  const n = finiteNumber(value);
  if (n == null || n <= 0) return null;
  return round2(n);
}

/**
 * Preview of Generate shares: absent Override ₱ comes out of the court cost,
 * then the rest is split across the included seat players.
 */
export function courtSplitPreview(
  totalCost: number,
  rows: CourtSplitRow[],
): CourtSplitPreview {
  const included = rows.filter((row) => row.included);
  const seats = included.filter((row) => !row.absent && !row.lateCancel);
  const absentCharges = included
    .filter((row) => row.absent)
    .map((row) => absentCharge(row.override))
    .filter((amount): amount is number => amount != null);

  const absentTotal = round2(
    absentCharges.reduce((sum, amount) => sum + amount, 0),
  );
  const pool = round2(Math.max(0, Number(totalCost) - absentTotal));
  const units = seats.map((row) => Number(row.units) || 0);
  const sameUnits =
    units.length > 0 && units.every((unit) => unit === units[0]);
  const seatHasOverride = seats.some((row) => finiteNumber(row.override) != null);
  const each =
    seats.length > 0 && sameUnits && !seatHasOverride ? pool / seats.length : null;
  const absentEach =
    absentCharges.length > 0 &&
    absentCharges.every((amount) => amount === absentCharges[0])
      ? absentCharges[0]
      : null;

  return {
    totalCost: Number(totalCost),
    pool,
    seatNames: seats.map((row) => row.name),
    each,
    absentCount: absentCharges.length,
    absentTotal,
    absentEach,
  };
}
