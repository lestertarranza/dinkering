import { PendingLink } from "@/components/PendingLink";
import { getAuthContext } from "@/lib/auth";
import { buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await getAuthContext();
  const signedInHref = ctx.user ? "/me" : "/login";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-3xl shadow-lg">
        🏓
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Dinkering Pickleball Team Manager
      </h1>
      <p className="mt-4 max-w-md text-slate-600">
        Court bookings, RSVP, payments, and shared expenses. Players can use a
        private link, or set up a login so they can sign in on any phone.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <PendingLink
          href={signedInHref}
          busyLabel={ctx.user ? "Opening your page…" : "Opening sign in…"}
          className={buttonClass("primary")}
        >
          {ctx.user ? "Open my page" : "Sign in"}
        </PendingLink>
        <PendingLink
          href="/register"
          busyLabel="Opening register…"
          className={buttonClass("secondary")}
        >
          Register
        </PendingLink>
        <PendingLink
          href="/claim"
          busyLabel="Opening claim…"
          className={buttonClass("secondary")}
        >
          Claim my name
        </PendingLink>
      </div>
      <p className="mt-10 max-w-md text-xs text-slate-400">
        Private player links still work without a login. Registration is for
        new people. If you are already on the team, claim your name.
      </p>
    </main>
  );
}
