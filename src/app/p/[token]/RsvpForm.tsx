"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatLockCountdown } from "@/lib/rsvp-lock";
import { submitRsvp } from "./actions";

function RsvpButton({
  value,
  label,
  current,
  disabled: forceDisabled = false,
}: {
  value: string;
  label: string;
  current: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const selected = current === value;
  const disabled = forceDisabled || pending;
  const tone =
    value === "going" || value === "waitlist"
      ? selected
        ? value === "going"
          ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
          : "bg-amber-500 text-white ring-2 ring-amber-300"
        : value === "going"
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
      : selected
        ? "bg-rose-600 text-white ring-2 ring-rose-300"
        : "bg-rose-50 text-rose-800 ring-1 ring-rose-200";

  return (
    <button
      type="submit"
      name="response_status"
      value={value}
      disabled={disabled}
      aria-pressed={selected}
      className={`min-h-11 flex-1 touch-manipulation rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 active:scale-95 disabled:opacity-60 disabled:active:scale-100 ${tone}`}
    >
      {pending && selected ? "Saving…" : label}
    </button>
  );
}

function LockCountdown({ lockAtIso }: { lockAtIso: string }) {
  const [label, setLabel] = useState<string | null>(() =>
    formatLockCountdown(new Date(lockAtIso)),
  );
  useEffect(() => {
    const tick = () => setLabel(formatLockCountdown(new Date(lockAtIso)));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [lockAtIso]);
  if (!label) return null;
  return (
    <p className="text-center text-xs font-medium text-amber-800" role="status">
      ⏳ {label}
    </p>
  );
}

function RsvpControls({
  currentStatus,
  isFull,
  locked = false,
  lockAtIso,
  waitlistPosition = null,
}: {
  currentStatus: string;
  isFull: boolean;
  locked?: boolean;
  lockAtIso?: string | null;
  waitlistPosition?: { position: number; total: number } | null;
}) {
  const onWaitlist = currentStatus === "waitlist";
  const showWaitlist = isFull && currentStatus !== "going";
  const isCommitted = locked && currentStatus === "going";

  if (isCommitted) {
    return (
      <>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="min-h-11 flex-1 touch-manipulation rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white ring-2 ring-emerald-300 opacity-100"
          >
            Going · Locked 🔒
          </button>
          <RsvpButton
            value="not_going"
            label="Not going"
            current={currentStatus}
            disabled
          />
        </div>
        <p className="text-center text-xs text-slate-600">
          RSVP locked — within 24h of game time. You&apos;re committed and will
          be charged.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        {showWaitlist ? (
          <RsvpButton
            value="waitlist"
            label={onWaitlist ? "On Waitlist" : "Join Waitlist"}
            current={currentStatus}
          />
        ) : (
          <RsvpButton value="going" label="Going" current={currentStatus} />
        )}
        <RsvpButton value="not_going" label="Not going" current={currentStatus} />
      </div>
      {lockAtIso && !locked ? <LockCountdown lockAtIso={lockAtIso} /> : null}
      {isFull && !onWaitlist && currentStatus !== "going" ? (
        <p className="text-center text-xs text-amber-700">
          Booking is full — joining places you on the waitlist.
        </p>
      ) : null}
      {onWaitlist ? (
        <p className="text-center text-xs text-amber-700">
          {waitlistPosition
            ? `You're #${waitlistPosition.position} of ${waitlistPosition.total} on the waitlist — you'll move to Going if a spot opens.`
            : "You're on the waitlist — you'll be moved to Going if a spot opens."}
        </p>
      ) : null}
    </>
  );
}

export function RsvpForm({
  token,
  bookingId,
  currentStatus,
  isFull = false,
  locked = false,
  lockAtIso = null,
  waitlistPosition = null,
  promoted = false,
}: {
  token: string;
  bookingId: string;
  currentStatus: string;
  isFull?: boolean;
  locked?: boolean;
  lockAtIso?: string | null;
  waitlistPosition?: { position: number; total: number } | null;
  promoted?: boolean;
}) {
  const [state, formAction] = useActionState(submitRsvp, null);
  const undoRef = useRef<HTMLFormElement>(null);
  const shown = state?.bookingId === bookingId ? state : null;

  return (
    <div className="flex flex-col gap-2">
      {promoted && currentStatus === "going" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          A spot opened. You&apos;re Going.
        </p>
      ) : null}
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="booking_id" value={bookingId} />
        <RsvpControls
          currentStatus={shown?.saved ?? currentStatus}
          isFull={isFull}
          locked={locked}
          lockAtIso={lockAtIso}
          waitlistPosition={waitlistPosition}
        />
      </form>
      {shown ? (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
            shown.ok
              ? "bg-emerald-50 text-emerald-800"
              : "bg-rose-50 text-rose-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <span>
            {shown.ok ? "Saved ✓" : "Couldn’t save"} · {shown.message}
          </span>
          {shown.ok && shown.previous && shown.previous !== shown.saved ? (
            <form action={formAction} ref={undoRef}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="booking_id" value={bookingId} />
              <input
                type="hidden"
                name="response_status"
                value={shown.previous}
              />
              <button
                type="submit"
                className="min-h-9 rounded-md px-2 text-sm font-semibold underline decoration-emerald-400 underline-offset-2"
              >
                Undo
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
