"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PendingLink } from "@/components/PendingLink";

const links = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/collections", label: "Collections", icon: "💰" },
  { href: "/admin/approvals", label: "Approvals", icon: "✅" },
  { href: "/admin/players", label: "Players", icon: "🧑" },
  { href: "/admin/groups", label: "Groups / Funds", icon: "👥" },
  { href: "/admin/bookings", label: "Bookings", icon: "📅" },
  { href: "/admin/payments", label: "Payments", icon: "💸" },
  { href: "/admin/expenses", label: "Team Expenses", icon: "🛒" },
  { href: "/admin/funds", label: "Club items", icon: "📦" },
  { href: "/admin/import", label: "Import", icon: "📥" },
  { href: "/admin/docs", label: "Help & Docs", icon: "📖" },
];

const mobileLinks = [
  { href: "/admin", label: "Home", icon: "📊" },
  { href: "/admin/collections", label: "Collect", icon: "💰" },
  { href: "/admin/bookings", label: "Games", icon: "📅" },
  { href: "/admin/payments", label: "Pay", icon: "💸" },
];

export function AdminNav({
  email,
  pendingCount = 0,
  playerToken = null,
}: {
  email: string | null;
  pendingCount?: number;
  playerToken?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">🏓</span> Dinkering
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-h-11 min-w-11 touch-manipulation rounded-lg p-2 text-slate-600 transition active:scale-95 active:bg-slate-200 hover:bg-slate-100"
          aria-label="Toggle menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </header>

      {open ? (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
          <nav
            className="fixed inset-x-0 z-50 max-h-[min(70vh,32rem)] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white px-2 py-3 shadow-xl"
            style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
            aria-label="More admin pages"
          >
            {links.map((l) => (
              <PendingLink
                key={l.href}
                href={l.href}
                busyLabel="Loading…"
                onClick={() => setOpen(false)}
                className={`flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                  isActive(l.href)
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                }`}
              >
                <span>{l.icon}</span>
                {l.label}
                {l.href === "/admin/approvals" && pendingCount > 0 ? (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {pendingCount}
                  </span>
                ) : null}
              </PendingLink>
            ))}
            {playerToken ? (
              <>
                <PendingLink
                  href={`/p/${playerToken}`}
                  busyLabel="Opening your page…"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <span>🏓</span> My player page
                </PendingLink>
                <PendingLink
                  href="/account"
                  busyLabel="Loading…"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <span>👤</span> Account
                </PendingLink>
              </>
            ) : null}
            <button
              onClick={signOut}
              className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <span>🚪</span> Sign out
            </button>
          </nav>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <Link
          href="/admin"
          className="flex items-center gap-2 px-5 py-5 text-lg font-semibold"
        >
          <span className="text-2xl">🏓</span> Dinkering
        </Link>
        <nav className="flex-1 space-y-1 px-3">
          {links.map((l) => (
            <PendingLink
              key={l.href}
              href={l.href}
              busyLabel="Loading…"
              className={`flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                isActive(l.href)
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
              {l.href === "/admin/approvals" && pendingCount > 0 ? (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {pendingCount}
                </span>
              ) : null}
            </PendingLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <p className="truncate px-3 pb-2 text-xs text-slate-400">{email}</p>
          {playerToken ? (
            <div className="mb-1 space-y-1">
              <PendingLink
                href={`/p/${playerToken}`}
                busyLabel="Opening your page…"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <span>🏓</span> My player page
              </PendingLink>
              <PendingLink
                href="/account"
                busyLabel="Loading…"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <span>👤</span> Account
              </PendingLink>
            </div>
          ) : null}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <span>🚪</span> Sign out
          </button>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex w-full max-w-full overflow-hidden border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Admin"
      >
        {mobileLinks.map((l) => (
          <PendingLink
            key={l.href}
            href={l.href}
            busyLabel="Loading…"
            className={`flex min-h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] font-semibold ${
              isActive(l.href) ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {l.icon}
            </span>
            <span className="max-w-full truncate">{l.label}</span>
          </PendingLink>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-0.5 !text-[11px] font-semibold text-slate-500"
        >
          <span className="text-lg leading-none" aria-hidden>
            {open ? "✕" : "☰"}
          </span>
          <span className="max-w-full truncate">More</span>
        </button>
      </nav>
    </>
  );
}
