"use client";

import { useEffect } from "react";

/** Scroll to a hash anchor on mount (e.g. /p/token#booking-uuid). */
export function ScrollToHash() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-emerald-400");
      const t = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-emerald-400");
      }, 2000);
      return () => window.clearTimeout(t);
    }
  }, []);
  return null;
}
