"use client";

import { useActionState } from "react";
import { submitPaymentProof, type ProofState } from "@/app/p/[token]/proof-actions";

export function PaymentProofForm({
  token,
  owed,
}: {
  token: string;
  owed: number;
}) {
  const [state, action, pending] = useActionState(submitPaymentProof, null as ProofState);

  return (
    <form action={action} className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm font-semibold text-slate-800">Send payment proof</p>
      <p className="text-xs text-slate-500">
        Screenshot of your transfer. Admin still confirms before it hits your balance.
      </p>
      <input
        type="file"
        name="proof"
        accept="image/*"
        required
        className="block w-full text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-600">
          Amount (optional)
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={owed > 0 ? owed.toFixed(2) : ""}
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Reference (optional)
          <input
            name="reference"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Bank ref"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload proof"}
      </button>
      {state ? (
        <p
          className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
