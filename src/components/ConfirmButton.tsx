"use client";

import { buttonClass } from "@/components/ui";

/**
 * Submits a server action after a native confirm() dialog.
 * Use for destructive / financial-reversal actions.
 */
export function ConfirmButton({
  action,
  message,
  children,
  variant = "danger",
  hidden,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  hidden?: Record<string, string>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {hidden
        ? Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}
      <button type="submit" className={buttonClass(variant)}>
        {children}
      </button>
    </form>
  );
}
