"use client";

import { useFormStatus } from "react-dom";
import { submitRsvp } from "./actions";

function RsvpButton({
  value,
  label,
  current,
}: {
  value: string;
  label: string;
  current: string;
}) {
  const { pending } = useFormStatus();
  const selected = current === value;
  const tone =
    value === "going"
      ? selected
        ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
        : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
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
      disabled={pending}
      className={`min-h-11 flex-1 touch-manipulation rounded-lg px-3 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-95 disabled:opacity-60 ${tone}`}
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
}: {
  currentStatus: string;
}) {
  return (
    <>
      <div className="flex gap-2">
        <RsvpButton value="going" label="Going" current={currentStatus} />
        <RsvpButton value="maybe" label="Maybe" current={currentStatus} />
        <RsvpButton
          value="not_going"
          label="Not going"
          current={currentStatus}
        />
      </div>
      <PendingHint />
    </>
  );
}

export function RsvpForm({
  token,
  bookingId,
  currentStatus,
}: {
  token: string;
  bookingId: string;
  currentStatus: string;
}) {
  return (
    <form action={submitRsvp} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <RsvpControls currentStatus={currentStatus} />
    </form>
  );
}
