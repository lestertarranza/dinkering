"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { transferBalancesBulk } from "../../actions";
import type { ActionState } from "@/lib/action-state";

export type BulkSource = {
  id: string;
  name: string;
  remaining: number;
  chargeCount: number;
};

export function BulkCollectForm({
  targetPlayerId,
  targetPlayerName,
  sources,
}: {
  targetPlayerId: string;
  targetPlayerName: string;
  sources: BulkSource[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transferBalancesBulk,
    null,
  );
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sources;
    return sources.filter((s) => s.name.toLowerCase().includes(needle));
  }, [sources, q]);

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const visibleIds = filtered.map((s) => s.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const chosen = sources.filter((s) => selected.has(s.id));
  const total = chosen.reduce((s, r) => s + r.remaining, 0);

  return (
    <form action={formAction} className="space-y-6">
      {state ? (
        <p
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            state.ok
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
          role="status"
        >
          {state.ok ? "✓ " : "⚠ "}
          {state.message}
        </p>
      ) : null}

      <input type="hidden" name="target_player_id" value={targetPlayerId} />
      {chosen.map((s) => (
        <input key={s.id} type="hidden" name="source_player_ids" value={s.id} />
      ))}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            Players with outstanding charges
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => toggleVisible(e.target.checked)}
            />
            Select all shown
          </label>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search names…"
          className={`${inputClass} mb-2`}
        />

        {sources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-400">
            No other players have outstanding charges to move.
          </p>
        ) : filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-400">
            No names match your search.
          </p>
        ) : (
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            {filtered.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{s.name}</p>
                  <p className="text-xs text-slate-400">
                    {s.chargeCount} open charge{s.chargeCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-rose-600">
                  {formatMoney(s.remaining)}
                </span>
              </label>
            ))}
          </div>
        )}

        {chosen.length > 0 ? (
          <div className="mt-2 flex justify-between rounded-lg bg-rose-50 px-4 py-2 text-sm">
            <span className="font-medium text-rose-800">
              {chosen.length} player{chosen.length === 1 ? "" : "s"} selected
            </span>
            <span className="font-bold text-rose-700">{formatMoney(total)}</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Transfer date">
          <input
            name="transfer_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            name="notes"
            placeholder="e.g. consolidate to one payer"
            className={inputClass}
          />
        </Field>
      </div>

      {chosen.length > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-800">Transfer preview</p>
          <ul className="mt-2 space-y-1 text-emerald-900">
            {chosen.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 font-medium">
                  {formatMoney(s.remaining)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-emerald-200 pt-2 text-xs text-emerald-700">
            {formatMoney(total)} of debt moves onto{" "}
            <strong>{targetPlayerName}</strong>. Each selected player is
            credited; {targetPlayerName} is charged the same amounts. Their
            original court/expense rows stay on the old names for history.
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || chosen.length === 0 || total <= 0}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "Transferring…"
          : `Move ${formatMoney(total)} onto ${targetPlayerName}`}
      </button>
    </form>
  );
}
