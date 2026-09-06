"use client";

import { useActionState } from "react";
import { cycleResponse } from "@/app/admin/bookings/actions";

export function CycleRsvpButton({
  bookingId,
  playerId,
  current,
}: {
  bookingId: string;
  playerId: string;
  current: string;
}) {
  const [state, action, pending] = useActionState(cycleResponse, null);

  return (
    <form action={action}>
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="player_id" value={playerId} />
      <button
        type="submit"
        disabled={pending}
        title={`Tap to cycle RSVP (now ${current})`}
        className="min-h-9 rounded-md px-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-60"
      >
        {pending ? "…" : "Cycle"}
      </button>
      {state && !state.ok ? (
        <span className="ml-1 text-xs text-rose-600">{state.message}</span>
      ) : null}
    </form>
  );
}
