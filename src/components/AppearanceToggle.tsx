"use client";

import { useEffect, useState } from "react";

const KEY = "dinkering-appearance";
type Mode = "default" | "sun" | "dark";

function apply(mode: Mode) {
  const el = document.documentElement;
  el.classList.toggle("sun-mode", mode === "sun");
  el.classList.toggle("dark-mode", mode === "dark");
}

export function AppearanceToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("default");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Mode | null) ?? "default";
    if (stored === "sun" || stored === "dark" || stored === "default") {
      setMode(stored);
      apply(stored);
    }
  }, []);

  function cycle() {
    const next: Mode =
      mode === "default" ? "sun" : mode === "sun" ? "dark" : "default";
    setMode(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  const label =
    mode === "sun" ? "Sun" : mode === "dark" ? "Dark" : "Look";

  return (
    <button
      type="button"
      onClick={cycle}
      className={
        compact
          ? "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-slate-500"
          : "min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"
      }
      aria-label={`Appearance: ${label}. Tap to change.`}
    >
      <span className="text-lg" aria-hidden>
        {mode === "sun" ? "☀️" : mode === "dark" ? "🌙" : "Aa"}
      </span>
      {compact ? label : null}
    </button>
  );
}
