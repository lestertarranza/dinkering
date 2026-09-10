import { round2 } from "./ledger";

export type ClubFundEntryKind = "allocate" | "spend";

/**
 * Accrual pot: every non-voided allocate minus spends. Game contributions used
 * to land here at charge time. Prefer {@link fundCashAvailable} for the number
 * managers should treat as money in hand.
 */
export function fundBalanceFromEntries(
  entries: { kind: string; amount: number; voided?: boolean | null }[],
): number {
  return round2(
    entries.reduce((sum, e) => {
      if (e.voided) return sum;
      const n = Number(e.amount);
      if (!Number.isFinite(n)) return sum;
      if (e.kind === "allocate") return sum + n;
      if (e.kind === "spend") return sum - n;
      return sum;
    }, 0),
  );
}

export type ClubFundCashParts = {
  /** Charged to players (game contribution shares, not voided). */
  billed: number;
  /** FIFO-settled portion of those shares. */
  collected: number;
  unpaid: number;
  /** Opening cash / donations (allocate rows with no booking). */
  manualIn: number;
  spent: number;
};

/** Cash in the pot: collected contributions + donations − purchases. */
export function fundCashAvailable(parts: ClubFundCashParts): number {
  return round2(parts.collected + parts.manualIn - parts.spent);
}

export function withFundCashAvailable(parts: ClubFundCashParts): ClubFundCashParts & {
  available: number;
} {
  return { ...parts, available: fundCashAvailable(parts) };
}
