"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { createPayment, type PaymentState } from "./actions";

type Opt = { id: string; name: string };
type BookingOpt = { id: string; booking_code: string | null; play_date: string };
type ExpenseOpt = {
  id: string;
  expense_code: string | null;
  description: string;
};

export function PaymentForm({
  players,
  groups,
  bookings,
  expenses,
  defaultBooking,
  defaultExpense,
}: {
  players: Opt[];
  groups: Opt[];
  bookings: BookingOpt[];
  expenses: ExpenseOpt[];
  defaultBooking?: string;
  defaultExpense?: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentState, FormData>(
    createPayment,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the form after a successful save (keeps default date/booking).
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {state ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {state.ok ? "✓ " : "⚠ "}
          {state.message}
        </p>
      ) : null}

      <Field label="Payer">
        <select name="payer" required className={inputClass}>
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount">
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
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
      <Field
        label="For booking"
        hint="Optional — leave blank for advance / general"
      >
        <select name="booking_id" defaultValue={defaultBooking} className={inputClass}>
          <option value="">General / advance payment</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.booking_code} · {formatDate(b.play_date)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="For team expense"
        hint="Optional — used only when no booking is selected"
      >
        <select
          name="team_expense_id"
          defaultValue={defaultExpense}
          className={inputClass}
        >
          <option value="">None</option>
          {expenses.map((e) => (
            <option key={e.id} value={e.id}>
              {e.expense_code ? `${e.expense_code} · ` : ""}
              {e.description}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Method">
          <input
            name="payment_method"
            placeholder="GCash / Cash / Bank / Others"
            className={inputClass}
          />
        </Field>
        <Field label="Reference number" hint="Transaction or reference number">
          <input
            name="reference_number"
            placeholder="e.g. 1234567890"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "w-full")}
      >
        {pending ? "Recording…" : "Record payment"}
      </button>
    </form>
  );
}
