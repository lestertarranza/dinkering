"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Card, EmptyState } from "@/components/ui";

export type BalanceBucket = "owe" | "credit" | "settled";

export type BalanceItem = {
  /** Stable React key. */
  key: string;
  /** Lowercased-on-compare text this row matches against (name + members). */
  search: string;
  /** Which column this entry belongs in. */
  bucket: BalanceBucket;
  /** The already-rendered row (a Link element). */
  node: ReactNode;
};

/**
 * Two-column team balances board with a name filter. Credits on the left, folks
 * who owe on the right (they stack into a single column on mobile). Settled
 * entries fall into a full-width section beneath so everyone stays findable.
 */
export function TeamBalanceBoard({
  items,
  minToShowSearch = 8,
}: {
  items: BalanceItem[];
  minToShowSearch?: number;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((i) => i.search.toLowerCase().includes(needle))
        : items,
    [items, needle],
  );

  const credit = filtered.filter((i) => i.bucket === "credit");
  const owe = filtered.filter((i) => i.bucket === "owe");
  const settled = filtered.filter((i) => i.bucket === "settled");

  return (
    <>
      {items.length >= minToShowSearch ? (
        <div className="mb-3">
          <input
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your name…"
            aria-label="Search your name"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="No player matches your search" />
      ) : (
        <div className="space-y-4">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <BalanceColumn
              title="In credit"
              tone="credit"
              items={credit}
              emptyLabel="No one has credit right now."
            />
            <BalanceColumn
              title="Owes the team"
              tone="owe"
              items={owe}
              emptyLabel="Everyone's paid up — nice!"
            />
          </div>
          {settled.length > 0 ? (
            <BalanceColumn title="Settled up" tone="settled" items={settled} />
          ) : null}
        </div>
      )}
    </>
  );
}

function BalanceColumn({
  title,
  tone,
  items,
  emptyLabel,
}: {
  title: string;
  tone: BalanceBucket;
  items: BalanceItem[];
  emptyLabel?: string;
}) {
  const accent =
    tone === "owe"
      ? "text-rose-600"
      : tone === "credit"
        ? "text-emerald-600"
        : "text-slate-500";
  return (
    <section>
      <h2
        className={`mb-2 px-1 text-xs font-bold uppercase tracking-wide ${accent}`}
      >
        {title}
        {items.length > 0 ? (
          <span className="text-slate-400"> · {items.length}</span>
        ) : null}
      </h2>
      {items.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-slate-400">
          {emptyLabel}
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {items.map((i) => (
            <Fragment key={i.key}>{i.node}</Fragment>
          ))}
        </Card>
      )}
    </section>
  );
}
