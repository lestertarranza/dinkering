"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

/**
 * A submit button (for use inside an existing <form>) that asks for
 * confirmation before allowing the form to submit. Avoids nesting forms.
 */
export function ConfirmSubmit({
  message,
  children,
  variant = "primary",
  pendingLabel = "Saving…",
}: {
  message: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={buttonClass(variant)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
