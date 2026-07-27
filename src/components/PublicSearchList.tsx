"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Card, EmptyState } from "@/components/ui";

export type SearchItem = {
  /** Stable React key. */
  key: string;
  /** Lowercased-on-compare text this row can be matched against (e.g. name). */
  search: string;
  /** The already-rendered row (a Link/row element). */
  node: ReactNode;
};

/**
 * Client-side name filter for public list pages (team balances, booking
 * roster). Rows are rendered on the server and passed in as `items`; this
 * component only adds a search box and filters by `search` text. The search box
 * appears once there are enough rows to be worth filtering.
 */
export function PublicSearchList({
  items,
  placeholder = "Search by name…",
  emptyTitle = "No matches",
  minToShowSearch = 8,
}: {
  items: SearchItem[];
  placeholder?: string;
  emptyTitle?: string;
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
  const showSearch = items.length >= minToShowSearch;

  return (
    <>
      {showSearch ? (
        <div className="mb-3">
          <input
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {filtered.map((i) => (
            <Fragment key={i.key}>{i.node}</Fragment>
          ))}
        </Card>
      )}
    </>
  );
}
