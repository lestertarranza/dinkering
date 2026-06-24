"use client";

import { useActionState, useState, useMemo } from "react";
import { Field, inputClass } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/format";
import { transferBalance } from "../actions";
import type { ActionState } from "@/lib/action-state";
import type { OpenCharge } from "@/lib/payment-allocation";

type PlayerOpt = { id: string; name: string };

export function TransferForm({
  sourcePlayerId,
  sourcePlayerName,
  openCharges,
  players,
}: {
  sourcePlayerId: string;
  sourcePlayerName: string;
  openCharges: OpenCharge[];
  players: PlayerOpt[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transferBalance,
    null,
  );

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(openCharges.map((c) => c.source_id)),
  );

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(openCharges.map((c) => c.source_id)) : new Set());

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });

  const selectedCharges = openCharges.filter((c) => selected.has(c.source_id));
  const total = useMemo(
    () => selectedCharges.reduce((s, c) => s + c.remaining, 0),
    [selectedCharges],
  );

  const itemsJson = JSON.stringify(
    selectedCharges.map((c) => ({ label: c.label, amount: c.remaining })),
  );

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

      <input type="hidden" name="source_player_id" value={sourcePlayerId} />
      <input type="hidden" name="amount" value={total.toFixed(2)} />
      <input type="hidden" name="items_json" value={itemsJson} />

      {/* Charge selection */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Select charges to transfer
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={selected.size === openCharges.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            Select all
          </label>
        </div>

        {openCharges.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-400">
            No outstanding charges — nothing to transfer.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {openCharges.map((c) => (
              <label
                key={c.source_id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.source_id)}
                  onChange={(e) => toggle(c.source_id, e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{c.label}</p>
                  <p className="text-xs text-slate-400">
                    {formatDate(c.entry_date)}
                  </p>
                </div>
                <span className="shrink-0 font-semibold text-rose-600">
                  {formatMoney(c.remaining)}
                </span>
              </label>
            ))}
          </div>
        )}

        {selectedCharges.length > 0 ? (
          <div className="mt-2 flex justify-between rounded-lg bg-rose-50 px-4 py-2 text-sm">
            <span className="font-medium text-rose-800">
              {selectedCharges.length} charge{selectedCharges.length > 1 ? "s" : ""} selected
            </span>
            <span className="font-bold text-rose-700">{formatMoney(total)}</span>
          </div>
        ) : null}
      </div>

      {/* Target player */}
      <Field label="Transfer to (target player)">
        <select name="target_player_id" required className={inputClass}>
          <option value="">Select target player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

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
            placeholder="e.g. left the team"
            className={inputClass}
          />
        </Field>
      </div>

      {/* Preview */}
      {selectedCharges.length > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-800">Transfer preview</p>
          <ul className="mt-2 space-y-1 text-emerald-900">
            {selectedCharges.map((c) => (
              <li key={c.source_id} className="flex justify-between gap-2">
                <span className="truncate">{c.label}</span>
                <span className="shrink-0 font-medium">{formatMoney(c.remaining)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-emerald-200 pt-2 text-xs text-emerald-700">
            A credit of <strong>{formatMoney(total)}</strong> will be posted to{" "}
            <strong>{sourcePlayerName}</strong> (removes their debt), and an
            equivalent charge to the target player. Both entries reference the
            original items for the audit trail.
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || selectedCharges.length === 0 || total <= 0}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Transferring…" : `Transfer ${formatMoney(total)}`}
      </button>
    </form>
  );
}
