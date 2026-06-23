"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";
import type { FormAction } from "@/lib/action-state";
import { ActionFeedback } from "./ActionFeedback";

function ConfirmSubmitInner({
  message,
  children,
  variant,
  pendingLabel,
}: {
  message: string;
  children: React.ReactNode;
  variant: "primary" | "secondary" | "danger" | "ghost";
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={buttonClass(variant)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Confirm dialog + pending state + success/error feedback. */
export function ConfirmButton({
  action,
  message,
  children,
  variant = "danger",
  hidden,
  pendingLabel = "Working…",
  className = "",
}: {
  action: FormAction;
  message: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  hidden?: Record<string, string>;
  pendingLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}
      {state ? <ActionFeedback state={state} className="mb-2" /> : null}
      <ConfirmSubmitInner
        message={message}
        variant={variant}
        pendingLabel={pendingLabel}
      >
        {children}
      </ConfirmSubmitInner>
    </form>
  );
}
