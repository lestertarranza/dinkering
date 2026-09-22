import { PendingLink } from "@/components/PendingLink";
import { Card, EmptyState } from "@/components/ui";
import { formatMoney, formatDate, SETTLE_TOLERANCE } from "@/lib/format";
import {
  publicPrimaryText,
  publicHintText,
} from "@/components/public-ui";

export type ActivityRow = {
  id: string;
  title: string;
  detail?: string;
  date: string;
  /** Positive = charged. Negative = paid / credit. */
  signedAmount: number;
  running: number;
};

function runningLabel(running: number): { text: string; className: string } {
  if (Math.abs(running) < SETTLE_TOLERANCE) {
    return { text: "Settled", className: "text-slate-500" };
  }
  if (running > 0) {
    return {
      text: `${formatMoney(running)} owed`,
      className: "text-rose-600",
    };
  }
  return {
    text: `${formatMoney(-running)} credit`,
    className: "text-emerald-600",
  };
}

export function PlayerActivityList({
  rows,
  page,
  pageSize,
  totalPages,
  total,
  pageHref,
  showRunning = true,
  emptyTitle = "No charges or payments yet",
  emptyDescription = "When games are split and payments come in, they will show up here.",
}: {
  rows: ActivityRow[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  pageHref: (n: number) => string;
  showRunning?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (total === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const shownFrom = (page - 1) * pageSize + 1;
  const shownTo = (page - 1) * pageSize + rows.length;

  return (
    <>
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {rows.map((row) => {
          const charged = row.signedAmount > 0;
          const run = runningLabel(row.running);
          return (
            <div
              key={row.id}
              className="flex items-start justify-between gap-3 px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className={`text-[15px] ${publicPrimaryText}`}>{row.title}</p>
                <p className={`mt-0.5 ${publicHintText}`}>
                  {formatDate(row.date)}
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-base font-bold ${
                    charged ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {charged
                    ? formatMoney(row.signedAmount)
                    : row.title === "Payment"
                      ? `Paid ${formatMoney(-row.signedAmount)}`
                      : `Credit ${formatMoney(-row.signedAmount)}`}
                </p>
                {showRunning ? (
                  <p className={`mt-0.5 text-xs font-medium ${run.className}`}>
                    {run.text}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>
      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <p className={publicHintText}>
          {shownFrom}–{shownTo} of {total}
        </p>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2 text-sm font-medium">
            {page > 1 ? (
              <PendingLink
                href={pageHref(page - 1)}
                busyLabel="Loading…"
                className="rounded-lg px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-50"
              >
                Newer
              </PendingLink>
            ) : null}
            <span className={publicHintText}>
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <PendingLink
                href={pageHref(page + 1)}
                busyLabel="Loading…"
                className="rounded-lg px-3 py-1.5 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-50"
              >
                Older
              </PendingLink>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className={`mt-1.5 px-1 ${publicHintText}`}>
        Red is a charge. Green is a payment or credit.
      </p>
    </>
  );
}
