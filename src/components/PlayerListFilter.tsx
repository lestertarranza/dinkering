"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { inputClass } from "@/components/ui";

/**
 * Filters descendant rows marked with data-player-name (and optional
 * data-player-status). Hidden rows stay in the form, so checkboxes still submit.
 */
export function PlayerListFilter({
  children,
  placeholder = "Search players…",
  statuses,
}: {
  children: ReactNode;
  placeholder?: string;
  statuses?: { value: string; label: string }[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [counts, setCounts] = useState<{ shown: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const needle = query.trim().toLowerCase();
    const items = root.querySelectorAll<HTMLElement>("[data-player-name]");
    let shown = 0;
    items.forEach((item) => {
      const name = (item.dataset.playerName ?? "").toLowerCase();
      const itemStatus = item.dataset.playerStatus ?? "";
      const hide =
        (needle.length > 0 && !name.includes(needle)) ||
        (status !== "" && itemStatus !== status);
      item.hidden = hide;
      if (!hide) shown += 1;
    });
    setCounts({ shown, total: items.length });
  }, [query, status, children]);

  return (
    <div ref={rootRef}>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`${inputClass} w-full min-w-0 sm:w-auto sm:min-w-[12rem] sm:flex-1`}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
        {statuses ? (
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Status"
            className={`${inputClass} w-full sm:w-auto sm:max-w-[11rem]`}
          >
            {statuses.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {counts && counts.total > 0 && counts.shown === 0 ? (
        <p className="mb-2 text-sm text-slate-400">No players match.</p>
      ) : counts && (query.trim() || status) ? (
        <p className="mb-2 text-xs text-slate-400">
          {counts.shown} of {counts.total}
        </p>
      ) : null}
      {children}
    </div>
  );
}
