"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export const PLAYER_TOKEN_KEY = "dinkering-player-token";
const TEAM_TOKEN_KEY = "dinkering-team-token";

function subscribeHome(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("dinkering-home", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("dinkering-home", onStoreChange);
  };
}

function readPlayerToken() {
  return localStorage.getItem(PLAYER_TOKEN_KEY);
}

function readTeamToken() {
  return localStorage.getItem(TEAM_TOKEN_KEY);
}

export function rememberPublicTokens(opts: {
  playerToken?: string | null;
  teamToken?: string | null;
  /** Overwrite an already-saved My page. */
  claimPlayer?: boolean;
  /** Do not bookmark this player (claimed names that are not yours). */
  skipPlayer?: boolean;
}) {
  if (typeof window === "undefined") return;
  if (opts.teamToken) localStorage.setItem(TEAM_TOKEN_KEY, opts.teamToken);
  if (opts.skipPlayer || !opts.playerToken) return;
  const existing = localStorage.getItem(PLAYER_TOKEN_KEY);
  if (opts.claimPlayer || !existing) {
    localStorage.setItem(PLAYER_TOKEN_KEY, opts.playerToken);
    window.dispatchEvent(new Event("dinkering-home"));
  }
}

export function RememberPublicTokens({
  playerToken,
  teamToken,
  claimPlayer = false,
  skipPlayer = false,
}: {
  playerToken?: string | null;
  teamToken?: string | null;
  claimPlayer?: boolean;
  skipPlayer?: boolean;
}) {
  useEffect(() => {
    rememberPublicTokens({ playerToken, teamToken, claimPlayer, skipPlayer });
  }, [playerToken, teamToken, claimPlayer, skipPlayer]);
  return null;
}

/** Save this player as Home / My page. */
export function SaveAsMyPage({
  playerToken,
  teamToken,
  goHome = false,
  compact = false,
  verified = false,
  owned = false,
}: {
  playerToken: string;
  teamToken?: string | null;
  goHome?: boolean;
  compact?: boolean;
  /** Claimed names cannot be saved as My page from the shared list. */
  verified?: boolean;
  /** Signed-in player who already claimed this name. */
  owned?: boolean;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const saved = useSyncExternalStore(subscribeHome, readPlayerToken, () => null);
  const mine = owned || saved === playerToken;
  const labelClass = compact
    ? "text-xs font-semibold text-emerald-700"
    : "text-sm font-semibold text-emerald-700";
  const profileHref = `/p/${playerToken}`;

  if (!hydrated) return null;
  if (verified) {
    if (mine) {
      return (
        <Link
          href={profileHref}
          className={
            compact
              ? "inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"
              : "inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white"
          }
        >
          Go to My Profile
        </Link>
      );
    }
    return <p className={labelClass}>Verified</p>;
  }
  if (mine) {
    return <p className={labelClass}>Saved as My page</p>;
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
        if (goHome) router.push(profileHref);
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
  const storedP = useSyncExternalStore(subscribeHome, readPlayerToken, () => null);
  const storedT = useSyncExternalStore(subscribeHome, readTeamToken, () => null);
  const p = playerToken || storedP;
  const t = teamToken || storedT;

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
