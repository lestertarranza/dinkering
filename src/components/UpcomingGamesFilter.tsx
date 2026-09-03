"use client";

import { useMemo, useState, type ReactNode } from "react";

export type GameFilter = "all" | "going" | "pending";

export function UpcomingGamesFilter({
  items,
}: {
  items: { key: string; status: string; node: ReactNode }[];
}) {
  const [filter, setFilter] = useState<GameFilter>("all");
  const filtered = useMemo(() => {
    if (filter === "going")
      return items.filter(
        (i) => i.status === "going" || i.status === "waitlist",
      );
    if (filter === "pending")
      return items.filter(
        (i) => i.status !== "going" && i.status !== "not_going" && i.status !== "waitlist",
      );
    return items;
  }, [items, filter]);

  const chips: { key: GameFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "going", label: "Going" },
    { key: "pending", label: "Not responded" },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter games">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={`min-h-10 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
              filter === c.key
                ? "bg-emerald-600 text-white ring-emerald-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          {filter === "pending"
            ? "You're all set — every upcoming game has a reply."
            : filter === "going"
              ? "No Going or waitlisted games right now."
              : "No upcoming games."}
        </p>
      ) : (
        <div className="space-y-3">{filtered.map((i) => <div key={i.key}>{i.node}</div>)}</div>
      )}
    </div>
  );
}
