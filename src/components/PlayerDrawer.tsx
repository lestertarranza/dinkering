"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export type PlayerDrawerPayload = {
  name: string;
  playerHref: string;
  rsvp: string;
  attendance: string | null;
  balanceLabel?: string | null;
};

export function PlayerDrawerTrigger({
  payload,
  children,
}: {
  payload: PlayerDrawerPayload;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 truncate text-left font-medium text-slate-800 hover:text-emerald-700"
      >
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <p className="text-lg font-semibold text-slate-900">{payload.name}</p>
            <p className="mt-1 text-sm text-slate-600">
              RSVP: {payload.rsvp}
              {payload.attendance ? ` · ${payload.attendance}` : ""}
            </p>
            {payload.balanceLabel ? (
              <p className="mt-1 text-sm font-medium text-rose-700">
                {payload.balanceLabel}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Link
                href={payload.playerHref}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white"
              >
                Open player
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
