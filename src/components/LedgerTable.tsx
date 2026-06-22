import { formatMoney, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui";
import type { LedgerEntry } from "@/lib/types";

const sourceLabels: Record<string, string> = {
  booking_share: "Court share",
  payment: "Payment",
  team_expense_share: "Expense share",
  team_expense_credit: "Expense reimbursement",
  manual_adjustment: "Adjustment",
};

/**
 * Renders a ledger with a running balance column.
 * Entries should be passed oldest-first; the running balance is computed
 * in order and the table is displayed newest-first.
 */
export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  const ordered = [...entries].sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date);
    if (d !== 0) return d;
    return a.created_at.localeCompare(b.created_at);
  });

  const withRunning: { entry: LedgerEntry; running: number }[] = [];
  let running = 0;
  for (const e of ordered) {
    if (!e.voided) running += Number(e.debit_amount) - Number(e.credit_amount);
    withRunning.push({ entry: e, running });
  }
  withRunning.reverse();

  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-400">
        No ledger entries yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Description</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 text-right font-medium">Charge</th>
            <th className="px-4 py-2 text-right font-medium">Credit</th>
            <th className="px-4 py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {withRunning.map(({ entry, running }) => (
            <tr
              key={entry.id}
              className={entry.voided ? "text-slate-400 line-through" : ""}
            >
              <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                {formatDate(entry.entry_date)}
              </td>
              <td className="px-4 py-2">
                {entry.description || "—"}
                {entry.voided ? (
                  <span className="ml-2 align-middle">
                    <Badge tone="neutral">Voided</Badge>
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-2 text-slate-500">
                {sourceLabels[entry.source_type] ?? entry.source_type}
              </td>
              <td className="px-4 py-2 text-right text-rose-600">
                {Number(entry.debit_amount) > 0
                  ? formatMoney(entry.debit_amount)
                  : "—"}
              </td>
              <td className="px-4 py-2 text-right text-emerald-600">
                {Number(entry.credit_amount) > 0
                  ? formatMoney(entry.credit_amount)
                  : "—"}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-2 text-right font-medium ${
                  running > 0.005
                    ? "text-rose-600"
                    : running < -0.005
                      ? "text-emerald-600"
                      : "text-slate-500"
                }`}
              >
                {entry.voided ? "—" : formatMoney(running)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
