"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function PageBusyOverlay({
  show,
  label = "Loading…",
}: {
  show: boolean;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 40);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!mounted || !visible) return null;
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
