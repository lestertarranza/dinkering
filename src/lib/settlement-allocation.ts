import { round2 } from "@/lib/ledger";
import type { SourceType } from "@/lib/types";

/** A non-voided ledger row needed to attribute credits to charges. */
export type AllocRow = {
  entry_date: string;
  created_at: string;
  source_type: SourceType;
  source_id: string | null;
  debit_amount: number | string;
  credit_amount: number | string;
};

/**
 * A single FIFO settlement event: `amount` of a funding credit (payment,
 * buyer reimbursement, manual credit…) applied to a specific charge
 * (booking share, expense share, manual debit).
 */
export type Allocation = {
  charge_source_type: SourceType;
  charge_source_id: string;
  charge_date: string;
  funding_source_type: SourceType;
  funding_source_id: string | null;
  funding_date: string;
  amount: number;
};

const CHARGE_TYPES = new Set<SourceType>([
  "booking_share",
  "team_expense_share",
  "manual_adjustment",
]);

type Lot = {
  source_type: SourceType;
  source_id: string | null;
  date: string;
  remaining: number;
};

type Charge = {
  source_type: SourceType;
  source_id: string;
  date: string;
  remaining: number;
};

/**
 * Attribute a single wallet's credits to its charges chronologically (FIFO),
 * mirroring the remaining-balance logic in `payment-allocation` but recording
 * *which* credit settled *which* charge. Pure over ledger rows.
 *
 * Oldest credit lots are paired with the oldest open charges. The resulting
 * allocations are the audit trail of how every charge got settled — including
 * charges covered by pre-existing wallet credit ("auto-deducted from funds").
 */
export function computeWalletAllocations(rows: AllocRow[]): Allocation[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.entry_date !== b.entry_date)
      return a.entry_date < b.entry_date ? -1 : 1;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });

  const lots: Lot[] = [];
  const charges: Charge[] = [];
  const out: Allocation[] = [];
  let li = 0;
  let ci = 0;

  const match = () => {
    while (true) {
      while (li < lots.length && lots[li].remaining <= 0) li++;
      while (ci < charges.length && charges[ci].remaining <= 0) ci++;
      if (li >= lots.length || ci >= charges.length) return;
      const lot = lots[li];
      const charge = charges[ci];
      const amount = round2(Math.min(lot.remaining, charge.remaining));
      if (amount <= 0) return;
      out.push({
        charge_source_type: charge.source_type,
        charge_source_id: charge.source_id,
        charge_date: charge.date,
        funding_source_type: lot.source_type,
        funding_source_id: lot.source_id,
        funding_date: lot.date,
        amount,
      });
      lot.remaining = round2(lot.remaining - amount);
      charge.remaining = round2(charge.remaining - amount);
    }
  };

  for (const row of sorted) {
    const credit = Number(row.credit_amount);
    const debit = Number(row.debit_amount);
    if (credit > 0) {
      lots.push({
        source_type: row.source_type,
        source_id: row.source_id,
        date: row.entry_date,
        remaining: credit,
      });
    } else if (debit > 0 && CHARGE_TYPES.has(row.source_type) && row.source_id) {
      charges.push({
        source_type: row.source_type,
        source_id: row.source_id,
        date: row.entry_date,
        remaining: debit,
      });
    }
    match();
  }

  return out;
}
