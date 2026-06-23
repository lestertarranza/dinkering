"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/collections", label: "Collections", icon: "💰" },
  { href: "/admin/players", label: "Players", icon: "🧑" },
  { href: "/admin/groups", label: "Groups / Funds", icon: "👥" },
  { href: "/admin/bookings", label: "Bookings", icon: "📅" },
  { href: "/admin/payments", label: "Payments", icon: "💸" },
  { href: "/admin/expenses", label: "Team Expenses", icon: "🛒" },
  { href: "/admin/import", label: "Import", icon: "📥" },
];

export function AdminNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
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
        <nav className="border-b border-slate-200 bg-white px-2 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                isActive(l.href)
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <span>🚪</span> Sign out
          </button>
        </nav>
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
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98] ${
                isActive(l.href)
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <p className="truncate px-3 pb-2 text-xs text-slate-400">{email}</p>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <span>🚪</span> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
