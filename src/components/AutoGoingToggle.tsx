"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui";

const AutoGoingState = createContext<{
  on: boolean;
  setOn: (on: boolean) => void;
} | null>(null);

export function AutoGoingProvider({
  initial,
  children,
}: {
  initial: boolean;
  children: ReactNode;
}) {
  const [on, setOn] = useState(initial);
  return (
    <AutoGoingState.Provider value={{ on, setOn }}>
      {children}
    </AutoGoingState.Provider>
  );
}

export function AutoGoingBadge() {
  const state = useContext(AutoGoingState);
  if (!state?.on) return null;
  return <Badge tone="going">Auto Going</Badge>;
}

export function AutoGoingToggle({
  playerId,
  canSave,
}: {
  playerId: string;
  canSave: boolean;
}) {
  const state = useContext(AutoGoingState);
  const on = state?.on ?? false;
  const setOn = state?.setOn;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onChange(checked: boolean) {
    if (!setOn || !canSave || saving) return;
    const previous = on;
    setOn(checked);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/players/auto-going", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, enabled: checked }),
      });
      if (!res.ok) {
        setOn(previous);
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error || "Could not save Auto Going.");
      }
    } catch {
      setOn(previous);
      setError("Could not save Auto Going.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={on}
          disabled={!canSave || saving}
          onChange={(e) => void onChange(e.target.checked)}
          className="mt-1"
        />
        <span>
          Auto Going on new bookings
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            {canSave
              ? "Saves immediately. Marked Going when a booking is created or duplicated. They can still change RSVP later."
              : "Cannot be changed until the Auto Going database update is applied. Until then, only the built-in hosts start as Going."}
          </span>
        </span>
      </label>
      {error ? (
        <p
          className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200"
          role="status"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
