"use client";

import { useActionState, type ReactNode } from "react";
import type { FormAction } from "@/lib/action-state";
import { ActionFeedback, ActionPending } from "./ActionFeedback";

export function ActionForm({
  action,
  className = "",
  children,
  pendingLabel = "Saving…",
  hidden,
  multipart = false,
}: {
  action: FormAction;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
  hidden?: ReactNode;
  /** Set true when the form includes a file input. */
  multipart?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form
      action={formAction}
      className={className}
      aria-busy={pending}
      encType={multipart ? "multipart/form-data" : undefined}
    >
      {hidden}
      <ActionFeedback state={state} className="mb-3" />
      <ActionPending pending={pending} label={pendingLabel} />
      {children}
    </form>
  );
}
