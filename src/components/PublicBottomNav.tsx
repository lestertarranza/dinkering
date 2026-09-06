"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PLAYER_TOKEN_KEY = "dinkering-player-token";
const TEAM_TOKEN_KEY = "dinkering-team-token";

export function rememberPublicTokens(opts: {
  playerToken?: string | null;
  teamToken?: string | null;
}) {
  if (typeof window === "undefined") return;
  if (opts.playerToken)
    localStorage.setItem(PLAYER_TOKEN_KEY, opts.playerToken);
  if (opts.teamToken) localStorage.setItem(TEAM_TOKEN_KEY, opts.teamToken);
}

export function RememberPublicTokens({
  playerToken,
  teamToken,
}: {
  playerToken?: string | null;
  teamToken?: string | null;
}) {
  useEffect(() => {
    rememberPublicTokens({ playerToken, teamToken });
  }, [playerToken, teamToken]);
  return null;
}

export function PublicBottomNav({
  playerToken,
  teamToken,
}: {
  playerToken?: string | null;
  teamToken?: string | null;
}) {
  const pathname = usePathname();
  const [stored, setStored] = useState<{ p: string | null; t: string | null }>({
    p: playerToken ?? null,
    t: teamToken ?? null,
  });

  useEffect(() => {
    setStored({
      p: playerToken || localStorage.getItem(PLAYER_TOKEN_KEY),
      t: teamToken || localStorage.getItem(TEAM_TOKEN_KEY),
    });
  }, [playerToken, teamToken]);

  const p = stored.p;
  const t = stored.t;

  if (!t && !p) return null;

  const items = [
    p
      ? { href: `/p/${p}`, label: "My page", icon: "🏓" }
      : null,
    t ? { href: `/schedule/${t}`, label: "Games", icon: "📅" } : null,
    t ? { href: `/board/${t}`, label: "Balances", icon: "💰" } : null,
  ].filter(Boolean) as { href: string; label: string; icon: string }[];

  if (items.length === 0) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur"
      aria-label="Player pages"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  active ? "text-emerald-700" : "text-slate-500"
                }`}
              >
                <span className="text-lg" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
