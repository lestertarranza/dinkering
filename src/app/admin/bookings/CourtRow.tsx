"use client";

import { useActionState, useEffect, useState } from "react";
import { inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney, formatTime } from "@/lib/format";
import { formatCourtNumber } from "@/lib/court-format";
import { updateCourt, removeCourt } from "./court-actions";
import type { BookingCourt } from "@/lib/types";

export function CourtRow({ court }: { court: BookingCourt }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateCourt, null);
  const [, removeAction] = useActionState(removeCourt, null);

  // Close the editor after a successful save
  useEffect(() => {
    if (updateState?.ok) setEditing(false);
  }, [updateState]);

  if (!editing) {
    return (
      <tr>
        <td className="py-2 text-slate-700">{formatCourtNumber(court.court_number)}</td>
        <td className="py-2 text-slate-500">{court.start_time ? formatTime(court.start_time) : "—"}</td>
        <td className="py-2 text-slate-500">{court.end_time ? formatTime(court.end_time) : "—"}</td>
        <td className="py-2 text-right text-slate-600">{court.hours}</td>
        <td className="py-2 text-right text-slate-600">{formatMoney(court.rate_per_court_per_hour)}</td>
        <td className="py-2 text-right text-slate-600">{court.max_players === 0 ? "∞" : court.max_players}</td>
        <td className="py-2 text-right font-medium text-slate-700">{formatMoney(court.hours * court.rate_per_court_per_hour)}</td>
        <td className="py-2 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-emerald-600 hover:underline"
          >
            Edit
          </button>
          <span className="mx-1 text-slate-300">·</span>
          <RemoveButton court={court} action={removeAction} />
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={8} className="py-2">
        <form action={updateAction} className="rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="id" value={court.id} />
          <input type="hidden" name="booking_id" value={court.booking_id} />
          {updateState && !updateState.ok ? (
            <p className="mb-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
              ⚠ {updateState.message}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="text-xs text-slate-500">
              Court number
              <input name="court_number" defaultValue={court.court_number ?? ""} className={inputClass} />
            </label>
            <label className="text-xs text-slate-500">
              Start time
              <input name="start_time" type="time" defaultValue={court.start_time ?? ""} className={inputClass} />
            </label>
            <label className="text-xs text-slate-500">
              End time
              <input name="end_time" type="time" defaultValue={court.end_time ?? ""} className={inputClass} />
            </label>
            <label className="text-xs text-slate-500">
              Hours
              <input name="hours" type="number" step="0.5" min="0.5" defaultValue={court.hours} required className={inputClass} />
            </label>
            <label className="text-xs text-slate-500">
              Rate / court / hr
              <input name="rate_per_court_per_hour" type="number" step="0.01" min="0" defaultValue={court.rate_per_court_per_hour} required className={inputClass} />
            </label>
            <label className="text-xs text-slate-500">
              Max players (0 = ∞)
              <input name="max_players" type="number" step="1" min="0" defaultValue={court.max_players} className={inputClass} />
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <SubmitButton variant="secondary" pendingLabel="Saving…">Save court</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function RemoveButton({
  court,
  action,
}: {
  court: BookingCourt;
  action: (formData: FormData) => void;
}) {
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (!confirm(`Remove ${formatCourtNumber(court.court_number)}? This reduces the booking total.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={court.id} />
      <input type="hidden" name="booking_id" value={court.booking_id} />
      <button type="submit" className="text-xs font-medium text-rose-600 hover:underline">
        Remove
      </button>
    </form>
  );
}
