"use client";

import { useActionState, useState, useEffect } from "react";
import { Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format";
import { addCourt } from "./court-actions";

export function CourtAddForm({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(addCourt, null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hours, setHours] = useState("1");
  const [rate, setRate] = useState("0");

  // Auto-calculate hours from start and end time
  useEffect(() => {
    if (!startTime || !endTime) return;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff > 0) {
      // Round to nearest 0.5
      setHours(String(Math.round(diff / 30) / 2));
    }
  }, [startTime, endTime]);

  const subtotal = (parseFloat(hours) || 0) * (parseFloat(rate) || 0);

  return (
    <form action={formAction} className="rounded-lg border border-dashed border-slate-300 p-3">
      <input type="hidden" name="booking_id" value={bookingId} />
      {state ? (
        <p
          className={`mb-2 rounded px-3 py-1.5 text-sm ${
            state.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
          role="status"
        >
          {state.ok ? "✓ " : "⚠ "}{state.message}
        </p>
      ) : null}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Add court</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Court number">
          <input name="court_number" placeholder="e.g. Court 3" className={inputClass} />
        </Field>
        <Field label="Start time">
          <input
            name="start_time"
            type="time"
            className={inputClass}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Field>
        <Field label="End time">
          <input
            name="end_time"
            type="time"
            className={inputClass}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
        <Field label="Hours" hint="Auto-calculated from times">
          <input
            name="hours"
            type="number"
            step="0.5"
            min="0.5"
            required
            className={inputClass}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>
        <Field label="Rate / court / hr">
          <input
            name="rate_per_court_per_hour"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="Max players" hint="0 = unlimited">
          <input
            name="max_players"
            type="number"
            step="1"
            min="0"
            defaultValue="0"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          Subtotal:{" "}
          <span className="font-semibold text-slate-700">{formatMoney(subtotal)}</span>
        </span>
        <SubmitButton variant="secondary" pendingLabel="Adding…">+ Add court</SubmitButton>
      </div>
    </form>
  );
}
