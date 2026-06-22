"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, className)}
    >
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
