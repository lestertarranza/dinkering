"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlayerActualStatus } from "@/app/admin/bookings/actions";
import { Badge, StatusBadge } from "@/components/ui";

const OPTIONS = [
  ["attended", "Attended"],
  ["absent", "Absent"],
  ["late_cancel", "Late cancel"],
  ["guest", "Guest"],
] as const;

function rowTone(status: string | null): string {
  if (status === "attended") return "bg-emerald-50";
  if (status === "absent") return "bg-rose-50";
  if (status === "late_cancel") return "bg-orange-50";
  if (status === "guest") return "bg-violet-50";
  return "bg-slate-50";
}

function nameTone(status: string | null): string {
  if (status === "attended") return "font-medium text-emerald-800";
  if (status === "absent") return "font-medium text-rose-800";
  if (status === "late_cancel") return "font-medium text-orange-900";
  if (status === "guest") return "font-medium text-violet-900";
  return "text-slate-700";
}

/**
 * Saves attendance without using the form action prop. That prop resets the
 * menu back to the first suggestion, so a waitlisted player snapped from
 * Attended back to Absent until a full refresh.
 */
export function AttendanceConfirmRow({
  bookingId,
  playerId,
  playerName,
  responseStatus,
  savedStatus,
  showCommitted,
}: {
  bookingId: string;
  playerId: string;
  playerName: string;
  responseStatus: string;
  savedStatus: string | null;
  showCommitted: boolean;
}) {
  const [applied, setApplied] = useState<string | null>(savedStatus);
  const [seenSaved, setSeenSaved] = useState(savedStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (savedStatus !== seenSaved) {
    setSeenSaved(savedStatus);
    setApplied(savedStatus);
  }

  function save(chosen: string) {
    if (pending || chosen === applied) return;
    const previous = applied;
    setApplied(chosen);
    setError(null);
    const data = new FormData();
    data.set("booking_id", bookingId);
    data.set("player_id", playerId);
    data.set("actual_status", chosen);
    startTransition(async () => {
      const result = await setPlayerActualStatus(null, data);
      if (result && !result.ok) {
        setApplied(previous);
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      data-player-name={playerName}
      className={`rounded-lg px-3 py-2 ${rowTone(applied)}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`min-w-0 text-sm ${nameTone(applied)}`}>{playerName}</span>
        {pending ? (
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
            role="status"
            aria-label="Saving"
          />
        ) : null}
        {showCommitted ? <Badge tone="warning">Committed</Badge> : null}
        <StatusBadge status={responseStatus} />
        {applied ? null : (
          <span className="text-xs text-slate-500">Not marked yet</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {OPTIONS.map(([status, label]) => {
          const selected = applied === status;
          return (
            <button
              key={status}
              type="button"
              disabled={pending}
              aria-pressed={selected}
              onClick={() => save(status)}
              className={`min-h-11 rounded-lg px-2 text-sm font-semibold ring-1 ring-inset disabled:opacity-60 ${chipTone(status, selected)}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="mt-1 text-sm text-rose-700" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function chipTone(status: string, selected: boolean): string {
  if (!selected) return "bg-white text-slate-700 ring-slate-200";
  if (status === "attended") return "bg-emerald-600 text-white ring-emerald-700";
  if (status === "absent") return "bg-rose-600 text-white ring-rose-700";
  if (status === "late_cancel") return "bg-orange-600 text-white ring-orange-700";
  return "bg-violet-600 text-white ring-violet-700";
}
