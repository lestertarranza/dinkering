import type { ReactNode } from "react";
import { PlayerAvatar } from "@/components/PlayerChip";
import { PendingLink } from "@/components/PendingLink";
import { SignOutButton } from "@/components/SignOutButton";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import { getAdminViewAs } from "@/lib/view-as";
import { stopViewAs } from "@/app/admin/view-as/actions";
import { PublicBottomNav } from "@/components/PublicBottomNav";

function sessionName(auth: AuthContext): string {
  const full = `${auth.profile?.first_name ?? ""} ${auth.profile?.last_name ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  return full || auth.user?.email || "Player";
}

export async function PlayerSessionBar({
  returnTo,
  viewingName,
}: {
  returnTo: string;
  viewingName?: string | null;
}) {
  const auth = await getAuthContext();
  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;
  const waiting =
    !!auth.user && !!auth.pendingRequest && !auth.profile?.player_id;
  const name = sessionName(auth);
  const showViewing =
    !!viewingName &&
    viewingName.trim().toLowerCase() !== name.trim().toLowerCase();

  let body: ReactNode;
  if (!auth.user) {
    body = (
      <>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500">
          ?
        </span>
        <p className="min-w-0 flex-1 text-sm text-slate-600">Not signed in</p>
        <PendingLink
          href={loginHref}
          busyLabel="Opening sign in…"
          className="inline-flex min-h-10 items-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
        >
          Sign in
        </PendingLink>
      </>
    );
  } else if (waiting) {
    body = (
      <>
        <PlayerAvatar name={name} src={auth.profile?.avatar_url} size="sm" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-amber-900">
          Waiting for approval
        </p>
        <SignOutButton
          label="Sign out"
          redirectTo={returnTo}
          className="!min-h-10 px-2 py-1 text-xs"
        />
      </>
    );
  } else {
    body = (
      <>
        <PlayerAvatar
          name={name}
          src={auth.profile?.avatar_url}
          size="sm"
          verified={!!auth.profile?.player_id}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            Signed in as {name}
          </p>
          {showViewing ? (
            <p className="truncate text-xs text-slate-500">
              Viewing {viewingName}
            </p>
          ) : null}
        </div>
        {auth.profile?.role === "admin" ? (
          <PendingLink
            href="/admin"
            busyLabel="Opening manager…"
            className="inline-flex min-h-10 items-center text-sm font-semibold text-emerald-700"
          >
            Manager
          </PendingLink>
        ) : null}
        <SignOutButton
          label="Sign out"
          redirectTo={returnTo}
          className="!min-h-10 px-2 py-1 text-xs"
        />
      </>
    );
  }

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        {body}
      </div>
    </div>
  );
}

export async function PublicChrome({
  returnTo,
  viewingName,
  teamToken,
  children,
}: {
  returnTo: string;
  viewingName?: string | null;
  teamToken?: string | null;
  children: ReactNode;
}) {
  const auth = await getAuthContext();
  const viewAs = await getAdminViewAs();
  return (
    <>
      <PlayerSessionBar returnTo={returnTo} viewingName={viewingName} />
      {viewAs ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
            <p className="text-sm text-amber-950">
              <span className="font-semibold">Viewing as {viewAs.name}.</span>{" "}
              Going, the waitlist, and payment proof use this player&apos;s wallet.
            </p>
            <form action={stopViewAs}>
              <button
                type="submit"
                className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-amber-800 px-3 text-sm font-semibold text-white"
              >
                Exit
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {children}
      <PublicBottomNav
        teamToken={teamToken}
        signedIn={!!auth.user}
        sessionPlayerToken={viewAs?.token ?? auth.playerToken}
      />
    </>
  );
}
