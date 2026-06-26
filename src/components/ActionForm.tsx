"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import type { FormAction, ActionState } from "@/lib/action-state";
import { ActionFeedback, ActionPending } from "./ActionFeedback";

const DISMISS_MS = 5000;

/** Wraps ActionFeedback to auto-dismiss after DISMISS_MS. */
function AutoDismissFeedback({ state }: { state: ActionState }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!state) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), DISMISS_MS);
    return () => clearTimeout(t);
  }, [state]);

  if (!visible || !state) return null;
  return <ActionFeedback state={state} className="mb-3" />;
}

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
      <AutoDismissFeedback state={state} />
      <ActionPending pending={pending} label={pendingLabel} />
      {children}
    </form>
  );
}
