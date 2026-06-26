import Link from "next/link";
import type { ReactNode } from "react";
import { dateChipParts } from "@/lib/format";

/** Wrapper for player/group/board/schedule pages — larger base text on mobile. */
export const publicMainClass =
  "mx-auto max-w-lg px-4 py-6 text-[17px] leading-relaxed sm:text-base";

/** Tappable list row — visible press feedback + 44px+ hit area. */
export const publicTapRowClass =
  "flex touch-manipulation items-center gap-3 px-4 py-3.5 transition-all duration-150 " +
  "hover:bg-slate-50 active:scale-[0.98] active:bg-emerald-100 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-500";

/** Block-level tappable row (schedule booking list). */
export const publicTapBlockClass =
  "block touch-manipulation px-4 py-3.5 transition-all duration-150 " +
  "hover:bg-slate-50 active:scale-[0.98] active:bg-emerald-100 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-500";

export const publicChevronClass =
  "shrink-0 text-lg font-semibold text-emerald-600";

/** Pill nav link between public pages. */
export const publicNavLinkClass =
  "inline-flex min-h-11 touch-manipulation items-center rounded-full border border-emerald-200 " +
  "bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm " +
  "transition-all duration-150 hover:bg-emerald-100 active:scale-95 active:bg-emerald-200 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500";

export const publicBackLinkClass =
  "inline-flex min-h-11 touch-manipulation items-center text-sm font-semibold text-emerald-700 " +
  "transition active:text-emerald-900 active:underline";

export function PublicTapLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${publicTapRowClass} ${className}`}>
      {children}
    </Link>
  );
}

export function PublicNavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={publicNavLinkClass}>
      {children}
    </Link>
  );
}

export function PublicPageHeader({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-5 text-center">
      <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
        {icon}
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1.5 text-base text-slate-600">{subtitle}</p>
      ) : null}
    </header>
  );
}

export function PublicSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2.5 px-1 text-sm font-bold uppercase tracking-wide text-slate-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Calendar-style date chip — weekday / day / month stacked. */
export function DateChip({
  value,
  size = "md",
}: {
  value: string | null | undefined;
  size?: "sm" | "md";
}) {
  const parts = dateChipParts(value);
  if (!parts) return null;
  const box =
    size === "md"
      ? "h-16 w-16 rounded-2xl"
      : "h-14 w-14 rounded-xl";
  const dayClass = size === "md" ? "text-2xl" : "text-xl";
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center border border-emerald-100 bg-emerald-50 leading-none shadow-sm ${box}`}
      aria-hidden
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
        {parts.weekday}
      </span>
      <span className={`font-extrabold text-slate-900 ${dayClass}`}>
        {parts.day}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
        {parts.month}
      </span>
    </div>
  );
}

/** Small colored count pill for RSVP tallies. */
export function CountPill({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "going" | "waitlist" | "maybe" | "not_going" | "neutral";
}) {
  const tones: Record<string, string> = {
    going: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    waitlist: "bg-amber-50 text-amber-700 ring-amber-200",
    maybe: "bg-amber-50 text-amber-700 ring-amber-200",
    not_going: "bg-rose-50 text-rose-700 ring-rose-200",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      <span className="font-bold">{count}</span>
      {label}
    </span>
  );
}

/** Capacity progress bar with going / max. */
export function CapacityBar({
  going,
  totalMax,
}: {
  going: number;
  totalMax: number;
}) {
  if (totalMax <= 0) return null;
  const slotsLeft = Math.max(0, totalMax - going);
  const pct = Math.min(100, Math.round((going / totalMax) * 100));
  const full = slotsLeft === 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-slate-500">{totalMax} max</span>
        <span className={full ? "text-rose-600" : "text-emerald-700"}>
          {full
            ? "Full — join waitlist"
            : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} remaining`}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${full ? "bg-rose-400" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Primary label on public list rows (booking code, player name, date). */
export const publicPrimaryText = "font-semibold text-slate-900";

/** Secondary metadata (venue, hints). */
export const publicMetaText = "text-sm text-slate-600";

/** Muted helper copy. */
export const publicHintText = "text-sm text-slate-500";
