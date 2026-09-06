import { round2 } from "./ledger";

export type ClubFundEntryKind = "allocate" | "spend";

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
