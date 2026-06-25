"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, formatMoney } from "@/lib/format";
import {
  createBulkPayment,
  previewBulkPayment,
  type PaymentState,
  type BulkPreview,
} from "./actions";
import { planBulkAllocation } from "@/lib/payment-allocation-plan";

type Opt = { id: string; name: string };

export function BulkPaymentForm({
  players,
  groups,
}: {
  players: Opt[];
  groups: Opt[];
}) {
  const [state, formAction] = useActionState<PaymentState, FormData>(
    createBulkPayment,
    null,
  );
  const [previewPending, startPreview] = useTransition();
  const [payer, setPayer] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<BulkPreview | null>(null);

  function loadPreview(nextPayer: string) {
    if (!nextPayer) {
      setPreview(null);
      return;
    }
    startPreview(async () => {
      const data = await previewBulkPayment(nextPayer);
      setPreview(data);
    });
  }

  const plan = useMemo(() => {
    if (!preview || !amount) return [];
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return [];
    return planBulkAllocation(preview.charges, n);
  }, [preview, amount]);

  return (
    <form action={formAction} className="space-y-3">
      {state ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          }`}
          role="status"
          aria-live="polite"
        >
          {state.ok ? "✓ " : "⚠ "}
          {state.message}
        </p>
      ) : null}

      <p className="text-sm text-slate-600">
        Pay a lump sum and auto-apply it to the oldest court shares and team
        expenses first. Each slice becomes its own payment record.
      </p>

      <Field label="Payer">
        <select
          name="payer"
          required
          className={inputClass}
          value={payer}
          onChange={(e) => {
            const v = e.target.value;
            setPayer(v);
            loadPreview(v);
          }}
        >
          <option value="">Select payer…</option>
          {groups.length > 0 ? (
            <optgroup label="Groups / pooled funds">
              {groups.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Players">
            {players.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>

      {previewPending ? (
        <p className="text-sm text-slate-500">Loading open charges…</p>
      ) : preview && payer ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">
            Open balance:{" "}
            <span className="text-rose-700">
              {formatMoney(preview.totalOwed)}
            </span>
          </p>
          {preview.charges.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              No outstanding charges — payment will be recorded as advance
              credit.
            </p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
              {preview.charges.map((c) => (
                <li key={`${c.source_type}-${c.source_id}`}>
                  {formatDate(c.entry_date)} · {c.label} ·{" "}
                  <span className="font-semibold text-rose-700">
                    {formatMoney(c.remaining)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Bulk amount">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            name="payment_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>
      </div>

      {plan.length > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Will create {plan.length} payment(s)
          </p>
          <ul className="mt-2 space-y-1 text-xs text-emerald-900">
            {plan.map((line, i) => (
              <li key={i}>
                {line.kind === "advance"
                  ? `Advance credit · ${formatMoney(line.amount)}`
                  : `${line.charge!.label} · ${formatMoney(line.amount)}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Method">
          <input
            name="payment_method"
            placeholder="GCash / Cash / Bank / Others"
            className={inputClass}
          />
        </Field>
        <Field label="Reference number">
          <input
            name="reference_number"
            placeholder="e.g. 1234567890"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Notes" hint="Optional — copied into each split payment">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Recording…">
        Record bulk payment
      </SubmitButton>
    </form>
  );
}
