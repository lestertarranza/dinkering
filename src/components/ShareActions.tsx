"use client";

import { useState } from "react";

const btnClass =
  "inline-flex min-h-10 touch-manipulation items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all duration-150 hover:bg-slate-50 active:scale-95 active:bg-slate-100";

export function CopyLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={btnClass}
      title={url}
    >
      {copied ? "✓ Copied" : (label ?? "Copy link")}
    </button>
  );
}

export function ShareLink({
  url,
  title,
  text,
  label = "Share",
}: {
  url: string;
  title?: string;
  text?: string;
  label?: string;
}) {
  const [shared, setShared] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ url, title, text });
        setShared(true);
        setTimeout(() => setShared(false), 1500);
        return;
      } catch {
        /* fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text ? `${text}\n${url}` : url);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" onClick={share} className={btnClass}>
      {shared ? "✓ Done" : label}
    </button>
  );
}

export function CopyReminder({
  message,
  label = "Copy reminder",
}: {
  message: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(message);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={`${btnClass} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 active:bg-amber-200`}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}
