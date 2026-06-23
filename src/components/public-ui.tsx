import Link from "next/link";
import type { ReactNode } from "react";

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

/** Primary label on public list rows (booking code, player name, date). */
export const publicPrimaryText = "font-semibold text-slate-900";

/** Secondary metadata (venue, hints). */
export const publicMetaText = "text-sm text-slate-600";

/** Muted helper copy. */
export const publicHintText = "text-sm text-slate-500";
