import type { LedgerEntry } from "@/lib/types";

/** Pull a booking or expense code out of a ledger description. */
export function ledgerCode(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = description.match(/\b(?:PB|EXP)-\d+\b/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Short player-facing title for a ledger row. Avoids admin jargon and long
 * "Court share" / "Bulk payment" strings.
 */
export function activityTitle(
  entry: LedgerEntry,
  opts?: { expenseDesc?: string | null },
): string {
  const code = ledgerCode(entry.description);
  switch (entry.source_type) {
    case "booking_share":
      return code ? `Game ${code}` : "Game share";
    case "payment":
      return "Payment";
    case "team_expense_share":
      return opts?.expenseDesc?.trim()
        ? opts.expenseDesc.trim()
        : "Team extra";
    case "team_expense_credit":
      return "Paid back";
    case "club_fund_share":
      return code ? `Club item · ${code}` : "Club item";
    case "club_fund_credit":
      return "Club item payout";
    case "manual_adjustment": {
      const d = entry.description ?? "";
      if (d.startsWith("Transfer ")) {
        const cut = d.search(/ — | - /);
        return (cut > 0 ? d.slice(0, cut) : d).trim() || "Transfer";
      }
      return "Adjustment";
    }
    default:
      return "Wallet entry";
  }
}
