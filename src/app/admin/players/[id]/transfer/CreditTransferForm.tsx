"use client";

import { useActionState, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { formatMoney, phTodayYmd } from "@/lib/format";
import { transferPersonalCredit } from "../../actions";
import type { ActionState } from "@/lib/action-state";

type PlayerOpt = { id: string; name: string };

export function CreditTransferForm({
  sourcePlayerId,
  sourcePlayerName,
  available,
  players,
}: {
  sourcePlayerId: string;
  sourcePlayerName: string;
  available: number;
  players: PlayerOpt[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transferPersonalCredit,
    null,
  );
  const [amount, setAmount] = useState(available > 0 ? available.toFixed(2) : "");
  const parsed = Number(amount);
  const ready = available > 0 && Number.isFinite(parsed) && parsed > 0 && parsed <= available + 0.001;

  return (
    <form action={formAction} className="space-y-4">
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

      {available <= 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          {sourcePlayerName} has no personal credit to send. Credit on a
          couple, family, or team fund stays in that shared wallet.
        </p>
      ) : (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Personal credit available:{" "}
          <strong>{formatMoney(available)}</strong>
        </p>
      )}

      <Field label="Amount to send">
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.50"
          max={available > 0 ? available.toFixed(2) : undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          disabled={available <= 0}
          className={inputClass}
        />
      </Field>

      <Field label="Send to">
        <select
          name="target_player_id"
          required
          disabled={available <= 0}
          className={inputClass}
        >
          <option value="">Select a player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input
            name="transfer_date"
            type="date"
            defaultValue={phTodayYmd()}
            className={inputClass}
          />
        </Field>
        <Field label="Notes (optional)">
          <input name="notes" className={inputClass} placeholder="Why this moved" />
        </Field>
      </div>

      {ready ? (
        <p className="text-sm text-slate-600">
          {formatMoney(parsed)} leaves {sourcePlayerName}&apos;s personal
          wallet and is added to the other player&apos;s personal wallet.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !ready}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send personal credit"}
      </button>
    </form>
  );
}
