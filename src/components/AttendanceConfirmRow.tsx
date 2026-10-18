"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setPlayerActualStatus } from "@/app/admin/bookings/actions";
import { Badge, StatusBadge, buttonClass } from "@/components/ui";

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
  const suggested =
    savedStatus ?? (responseStatus === "going" ? "attended" : "absent");
  const [value, setValue] = useState(suggested);
  const [applied, setApplied] = useState<string | null>(savedStatus);
  const [seenSaved, setSeenSaved] = useState(savedStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (savedStatus !== seenSaved) {
    setSeenSaved(savedStatus);
    setApplied(savedStatus);
    setValue(savedStatus ?? (responseStatus === "going" ? "attended" : "absent"));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosen = value;
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

  const buttonLabel = applied ? "Update" : "Confirm";

  return (
    <form
      onSubmit={onSubmit}
      className={`rounded-lg px-3 py-1.5 ${rowTone(applied)}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`truncate text-sm ${nameTone(applied)}`}>{playerName}</span>
          {pending ? (
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
              role="status"
              aria-label="Saving"
            />
          ) : null}
        </span>
        {showCommitted ? <Badge tone="warning">Committed</Badge> : null}
        <StatusBadge status={responseStatus} />
        <select
          name="actual_status"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {OPTIONS.map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("secondary")}
        >
          {buttonLabel}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-sm text-rose-700" role="status">
          {error}
        </p>
      ) : null}
    </form>
  );
}
