import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui";
import {
  formatBookingContext,
  type BookingContext,
} from "@/lib/booking-context";
import type { LedgerExpenseCtx } from "@/lib/ledger-attribution";
import type { LedgerEntry } from "@/lib/types";

// Re-export so the type is usable from the component's import path
export type { LedgerExpenseCtx };

const sourceLabels: Record<string, string> = {
  booking_share: "Court share",
  payment: "Payment",
  team_expense_share: "Expense share",
  team_expense_credit: "Expense reimbursement",
  manual_adjustment: "Adjustment",
};

/** Split a balance-transfer description into its header and per-item lines. */
function parseTransferDesc(
  desc: string | null,
): { header: string; items: string[] } | null {
  if (!desc?.startsWith("Transfer ")) return null;
  const dashIdx = desc.indexOf(" — ");
  if (dashIdx === -1) return null;
  const header = desc.slice(0, dashIdx).trim();
  const rest = desc.slice(dashIdx + 3).trim();
  const items = rest.length > 0
    ? rest.split(";").map((s) => s.trim()).filter(Boolean)
    : [];
  return { header, items };
}

/**
 * Renders a ledger with a running balance column.
 * Entries should be passed oldest-first; the running balance is computed
 * in order and the table is displayed newest-first.
 */
export function LedgerTable({
  entries,
  bookingContext,
  ownerNames,
  expenseContext,
  transferItems,
}: {
  entries: LedgerEntry[];
  bookingContext?: Map<string, BookingContext>;
  /** Optional per-entry person attribution (used on pooled group ledgers). */
  ownerNames?: Map<string, string>;
  /** Optional expense detail context for team_expense_share entries. */
  expenseContext?: Map<string, LedgerExpenseCtx>;
  /** Optional per-entry enriched item list for balance-transfer entries. */
  transferItems?: Map<string, string[]>;
}) {
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
                {(() => {
                  // Use pre-enriched items from the page if available, else
                  // fall back to parsing the raw description.
                  const enrichedItems = transferItems?.get(entry.id);
                  const transfer = enrichedItems
                    ? (() => {
                        const desc = entry.description ?? "";
                        const dashIdx = desc.indexOf(" — ");
                        return dashIdx > 0
                          ? { header: desc.slice(0, dashIdx).trim(), items: enrichedItems }
                          : null;
                      })()
                    : parseTransferDesc(entry.description);

                  if (transfer) {
                    return (
                      <>
                        <span>{transfer.header}</span>
                        {transfer.items.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {transfer.items.map((item, i) => (
                              <li key={i} className="flex items-baseline gap-1 text-xs text-slate-500">
                                <span className="shrink-0 text-slate-300">↳</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    );
                  }
                  return <>{entry.description || "—"}</>;
                })()}
                {(() => {
                  const owner = ownerNames?.get(entry.id);
                  return owner ? (
                    <span className="font-medium text-slate-500"> ({owner})</span>
                  ) : null;
                })()}
                {entry.voided ? (
                  <span className="ml-2 align-middle">
                    <Badge tone="neutral">Voided</Badge>
                  </span>
                ) : null}
                {(() => {
                  const ctx = formatBookingContext(bookingContext?.get(entry.id));
                  return ctx ? (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {ctx}
                    </span>
                  ) : null;
                })()}
                {(() => {
                  const ec = expenseContext?.get(entry.id);
                  if (!ec) return null;
                  const label = ec.expenseCode
                    ? `${ec.expenseCode} · ${ec.expenseDesc}`
                    : ec.expenseDesc;
                  const paidLine = ec.paidByName
                    ? ` · Paid by ${ec.paidByName}`
                    : "";
                  return (
                    <span className="mt-0.5 block text-xs text-slate-400">
                      <Link
                        href={`/admin/expenses/${ec.expenseId}`}
                        className="text-emerald-600 hover:underline"
                      >
                        {label}
                      </Link>
                      {paidLine}
                    </span>
                  );
                })()}
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
