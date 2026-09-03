"use client";

import { useMemo, useState, type ReactNode } from "react";

export function AdminSearchList({
  items,
  placeholder = "Search…",
  empty = "No matches",
}: {
  items: { key: string; search: string; node: ReactNode }[];
  placeholder?: string;
  empty?: string;
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

  return (
    <div>
      <input
        type="search"
        data-admin-search
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      />
      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">{filtered.map((i) => <li key={i.key}>{i.node}</li>)}</ul>
      )}
    </div>
  );
}
