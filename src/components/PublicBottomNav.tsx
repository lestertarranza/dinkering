"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export const PLAYER_TOKEN_KEY = "dinkering-player-token";
const TEAM_TOKEN_KEY = "dinkering-team-token";

export function rememberPublicTokens(opts: {
  playerToken?: string | null;
  teamToken?: string | null;
  /** Overwrite an already-saved My page. */
  claimPlayer?: boolean;
}) {
  if (typeof window === "undefined") return;
  if (opts.teamToken) localStorage.setItem(TEAM_TOKEN_KEY, opts.teamToken);
  if (opts.playerToken) {
    const existing = localStorage.getItem(PLAYER_TOKEN_KEY);
    if (opts.claimPlayer || !existing) {
      localStorage.setItem(PLAYER_TOKEN_KEY, opts.playerToken);
      window.dispatchEvent(new Event("dinkering-home"));
    }
  }
}

export function RememberPublicTokens({
  playerToken,
  teamToken,
  claimPlayer = false,
}: {
  playerToken?: string | null;
  teamToken?: string | null;
  claimPlayer?: boolean;
}) {
  useEffect(() => {
    rememberPublicTokens({ playerToken, teamToken, claimPlayer });
  }, [playerToken, teamToken, claimPlayer]);
  return null;
}

/** Save this player as Home / My page. */
export function SaveAsMyPage({
  playerToken,
  teamToken,
  goHome = false,
  compact = false,
}: {
  playerToken: string;
  teamToken?: string | null;
  goHome?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"unknown" | "mine" | "other" | "none">(
    "unknown",
  );

  useEffect(() => {
    const saved = localStorage.getItem(PLAYER_TOKEN_KEY);
    if (!saved) setState("none");
    else if (saved === playerToken) setState("mine");
    else setState("other");
  }, [playerToken]);

  if (state === "unknown") return null;
  if (state === "mine") {
    return (
      <p
        className={
          compact
            ? "text-xs font-semibold text-emerald-700"
            : "text-sm font-semibold text-emerald-700"
        }
      >
        Saved as My page
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        rememberPublicTokens({
          playerToken,
          teamToken,
          claimPlayer: true,
        });
        setState("mine");
        if (goHome) router.push(`/p/${playerToken}`);
      }}
      className={
        compact
          ? "min-h-10 shrink-0 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
          : "min-h-11 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white"
      }
    >
      This is me
    </button>
  );
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
    function refresh() {
      setStored({
        p: playerToken || localStorage.getItem(PLAYER_TOKEN_KEY),
        t: teamToken || localStorage.getItem(TEAM_TOKEN_KEY),
      });
    }
    refresh();
    window.addEventListener("dinkering-home", refresh);
    return () => window.removeEventListener("dinkering-home", refresh);
  }, [playerToken, teamToken]);

  const p = stored.p;
  const t = stored.t;

  if (!t && !p) return null;

  const items = [
    p ? { href: `/p/${p}`, label: "My page", icon: "🏓" } : null,
    t ? { href: `/players/${t}`, label: "Players", icon: "🧑" } : null,
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
