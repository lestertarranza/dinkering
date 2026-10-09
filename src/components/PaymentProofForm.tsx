"use client";

import { useActionState, useState, type FormEvent } from "react";
import { submitPaymentProof, type ProofState } from "@/app/p/[token]/proof-actions";
import { prepareProofField } from "@/lib/image-compress";

export function PaymentProofForm({
  token,
  owed,
}: {
  token: string;
  owed: number;
}) {
  const [state, action, pending] = useActionState(submitPaymentProof, null as ProofState);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPrepError(null);
    const form = e.currentTarget;
    const input = form.elements.namedItem("proof");
    const file =
      input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    if (!file || file.size === 0) {
      setPrepError("Choose a payment screenshot first.");
      return;
    }
    setPreparing(true);
    try {
      const err = await prepareProofField(form);
      if (err) {
        setPrepError(err);
        return;
      }
      const data = new FormData(form);
      await action(data);
    } finally {
      setPreparing(false);
    }
  }

  const busy = pending || preparing;

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      className="mt-4 space-y-3 rounded-xl border-2 border-emerald-300 bg-white p-4 shadow-sm"
      aria-busy={busy}
    >
      <input type="hidden" name="token" value={token} />
      <div>
        <p className="text-base font-semibold text-slate-900">Send payment proof</p>
        <p className="mt-1 text-sm text-slate-600">
          Add a screenshot of your transfer. Use this to pay a balance or to
          add credit for Going and the waitlist. Admin confirms it before it
          shows on your balance.
        </p>
      </div>

      <label
        className={`relative flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center ${
          fileName
            ? "border-emerald-600 bg-emerald-50"
            : "border-emerald-400 bg-emerald-50/80"
        }`}
      >
        <span className="text-base font-semibold text-emerald-950">
          {fileName ? "Screenshot ready" : "Tap here to add your screenshot"}
        </span>
        <span className="max-w-full truncate text-sm text-emerald-800">
          {fileName ?? "Choose a photo from your phone"}
        </span>
        <span className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">
          {fileName ? "Choose a different photo" : "Choose photo"}
        </span>
        <input
          type="file"
          name="proof"
          accept="image/*"
          aria-label="Payment screenshot"
          disabled={busy}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(e) => {
            const next = e.target.files?.[0]?.name ?? null;
            setFileName(next);
            setPrepError(null);
          }}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-slate-700">
          Amount (optional)
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={owed > 0 ? owed.toFixed(2) : ""}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          />
        </label>
        <label className="text-sm text-slate-700">
          Reference (optional)
          <input
            name="reference"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            placeholder="Bank ref"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="min-h-12 w-full rounded-xl bg-emerald-700 text-base font-semibold text-white disabled:opacity-60"
      >
        {preparing ? "Preparing photo…" : pending ? "Uploading…" : "Upload proof"}
      </button>
      {prepError ? (
        <p className="text-sm font-medium text-rose-700" role="status">
          {prepError}
        </p>
      ) : null}
      {state ? (
        <p
          className={`text-sm font-medium ${state.ok ? "text-emerald-700" : "text-rose-700"}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
