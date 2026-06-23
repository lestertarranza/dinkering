import { round2 } from "@/lib/ledger";
import { SETTLE_TOLERANCE } from "@/lib/format";
import type { OpenCharge } from "@/lib/payment-allocation";

export type AllocationLine = {
  charge: OpenCharge | null;
  amount: number;
  kind: "charge" | "advance";
};

/** Allocate a bulk amount to open charges oldest-first; remainder is advance credit. */
export function planBulkAllocation(
  charges: OpenCharge[],
  amount: number,
): AllocationLine[] {
  let remaining = round2(amount);
  const lines: AllocationLine[] = [];

  for (const charge of charges) {
    if (remaining <= SETTLE_TOLERANCE) break;
    const pay = round2(Math.min(charge.remaining, remaining));
    if (pay <= SETTLE_TOLERANCE) continue;
    lines.push({ charge, amount: pay, kind: "charge" });
    remaining = round2(remaining - pay);
  }

  if (remaining > SETTLE_TOLERANCE) {
    lines.push({ charge: null, amount: remaining, kind: "advance" });
  }

  return lines;
}

export function totalOpenDue(charges: OpenCharge[]): number {
  return round2(charges.reduce((s, c) => s + c.remaining, 0));
}
