"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function PageBusyOverlay({
  show,
  label = "Loading…",
}: {
  show: boolean;
  label?: string;
}) {
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <div className="page-busy" role="status" aria-live="polite">
      <div className="page-busy-bar" />
      <div className="page-busy-card">
        <span className="page-busy-spin" aria-hidden />
        <span>{label}</span>
      </div>
    </div>,
    document.body,
  );
}

function LinkBusy({ label }: { label?: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        aria-hidden
        className={`link-pending-dot ${pending ? "is-pending" : ""}`}
      />
      <PageBusyOverlay show={pending} label={label} />
    </>
  );
}

export function PendingLink({
  busyLabel = "Loading…",
  children,
  className,
  ...props
}: ComponentProps<typeof Link> & { busyLabel?: string; children: ReactNode }) {
  return (
    <Link {...props} className={`relative ${className ?? ""}`}>
      {children}
      <LinkBusy label={busyLabel} />
    </Link>
  );
}
