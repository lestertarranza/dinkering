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

export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      nav.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    const dismissed = localStorage.getItem("dinkering-a2hs") === "1";
    const isIos = /iphone|ipad|ipod/i.test(nav.userAgent);
    setShow(!standalone && !dismissed && isIos);
  }, []);
  if (!show) return null;
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
      <p>
        Add Dinkering to your Home Screen: tap Share, then{" "}
        <span className="font-semibold">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        className="mt-1 text-xs font-semibold underline"
        onClick={() => {
          localStorage.setItem("dinkering-a2hs", "1");
          setShow(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
