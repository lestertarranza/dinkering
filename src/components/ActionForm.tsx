"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { FormAction, ActionState } from "@/lib/action-state";
import { safeNextPath } from "@/lib/account-fields";
import { ActionFeedback, ActionPending } from "./ActionFeedback";

const DISMISS_MS = 5000;

/** Wraps ActionFeedback to auto-dismiss after DISMISS_MS. */
function AutoDismissFeedback({ state }: { state: ActionState }) {
  const [visible, setVisible] = useState(true);
  const [lastState, setLastState] = useState(state);

  // A new action result arrived — re-show the feedback (render-phase update,
  // the pattern React recommends over calling setState inside an effect).
  if (state !== lastState) {
    setLastState(state);
    setVisible(true);
  }

  useEffect(() => {
    if (!state) return;
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
  id,
  prepare,
}: {
  action: FormAction;
  className?: string;
  children: ReactNode;
  pendingLabel?: string;
  hidden?: ReactNode;
  id?: string;
  /** Mutate the form (e.g. shrink a photo) before the server action runs. */
  prepare?: (form: HTMLFormElement) => Promise<string | null>;
  /**
   * @deprecated No longer needed. React/Next automatically use multipart
   * encoding for function actions when a file input is present.
   */
  multipart?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const skipPrepare = useRef(false);

  useEffect(() => {
    const path = state?.ok ? safeNextPath(state.redirectTo) : null;
    if (path) router.push(path);
  }, [state, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!prepare || skipPrepare.current) {
      skipPrepare.current = false;
      return;
    }
    e.preventDefault();
    setPrepError(null);
    setPreparing(true);
    try {
      const err = await prepare(e.currentTarget);
      if (err) {
        setPrepError(err);
        return;
      }
      skipPrepare.current = true;
      e.currentTarget.requestSubmit();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <form
      id={id}
      action={formAction}
      onSubmit={prepare ? onSubmit : undefined}
      className={className}
      aria-busy={pending || preparing}
    >
      {hidden}
      {prepError ? (
        <p
          className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200"
          role="status"
        >
          ⚠ {prepError}
        </p>
      ) : null}
      <AutoDismissFeedback state={state} />
      <ActionPending
        pending={pending || preparing}
        label={preparing ? "Preparing photo…" : pendingLabel}
      />
      <fieldset disabled={preparing} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
