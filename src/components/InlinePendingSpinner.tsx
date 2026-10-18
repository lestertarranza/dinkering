"use client";

import { useFormStatus } from "react-dom";

/** Small brand spinner for the form that is currently submitting. */
export function InlinePendingSpinner() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
      role="status"
      aria-label="Saving"
    />
  );
}
