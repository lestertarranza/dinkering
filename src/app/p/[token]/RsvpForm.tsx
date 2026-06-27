"use client";

import { useFormStatus } from "react-dom";
import { submitRsvp } from "./actions";

function RsvpButton({
  value,
  label,
  current,
  isWaitlistFull = false,
  disabled: forceDisabled = false,
}: {
  value: string;
  label: string;
  current: string;
  isWaitlistFull?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const selected = current === value;
  const disabled = forceDisabled || pending;

  // Determine colour based on status type
  const tone =
    value === "going" || value === "waitlist"
      ? selected
        ? value === "going"
          ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
          : "bg-amber-500 text-white ring-2 ring-amber-300"
        : value === "going"
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
      : value === "maybe"
        ? selected
          ? "bg-amber-500 text-white ring-2 ring-amber-300"
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
      className={`min-h-11 flex-1 touch-manipulation rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-60 disabled:active:scale-100 ${tone}`}
    >
      {pending && selected ? "Saving…" : label}
    </button>
  );
}

function PendingHint() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="text-center text-sm font-medium text-emerald-700">
      Updating your RSVP…
    </p>
  );
}

function RsvpControls({
  currentStatus,
  isFull,
  locked = false,
}: {
  currentStatus: string;
  isFull: boolean;
  locked?: boolean;
}) {
  // When booking is at capacity and player isn't already going,
  // show Waitlist instead of Going.
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
            value="maybe"
            label="Maybe"
            current={currentStatus}
            disabled
          />
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
        <RsvpButton value="maybe" label="Maybe" current={currentStatus} />
        <RsvpButton value="not_going" label="Not going" current={currentStatus} />
      </div>
      {isFull && !onWaitlist && currentStatus !== "going" ? (
        <p className="text-center text-xs text-amber-700">
          Booking is full — joining places you on the waitlist.
        </p>
      ) : null}
      {onWaitlist ? (
        <p className="text-center text-xs text-amber-700">
          You&apos;re on the waitlist — you&apos;ll be moved to Going if a spot opens.
        </p>
      ) : null}
      <PendingHint />
    </>
  );
}

export function RsvpForm({
  token,
  bookingId,
  currentStatus,
  isFull = false,
  locked = false,
}: {
  token: string;
  bookingId: string;
  currentStatus: string;
  isFull?: boolean;
  locked?: boolean;
}) {
  return (
    <form action={submitRsvp} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <RsvpControls currentStatus={currentStatus} isFull={isFull} locked={locked} />
    </form>
  );
}
