import type { ActionState } from "@/lib/action-state";

export function ActionFeedback({
  state,
  className = "",
}: {
  state: ActionState;
  className?: string;
}) {
  if (!state) return null;
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        state.ok
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      {state.ok ? "✓ " : "⚠ "}
      {state.message}
    </p>
  );
}

export function ActionPending({
  pending,
  label = "Saving…",
}: {
  pending: boolean;
  label?: string;
}) {
  if (!pending) return null;
  return (
    <p
      className="text-sm font-medium text-emerald-700"
      role="status"
      aria-live="polite"
    >
      {label}
    </p>
  );
}
