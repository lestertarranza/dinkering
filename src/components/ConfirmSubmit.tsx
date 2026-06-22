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
}: {
  message: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
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
      {pending ? "Saving…" : children}
    </button>
  );
}
