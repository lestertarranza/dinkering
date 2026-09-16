import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadInviteIndex, loadLinkedIdentities } from "@/lib/accounts";
import { inviteOptionsFromIndex } from "@/lib/player-invite";
import { AuthShell } from "@/components/AuthShell";
import { AccountRequestForm } from "@/components/AccountRequestForm";
import { submitRegister } from "@/app/auth/actions";
import { buttonClass } from "@/components/ui";
import { SignedInAsAdminNotice } from "@/components/SignedInAsAdminNotice";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const ctx = await getAuthContext();
  if (ctx.profile?.role !== "admin" && ctx.profile?.player_id) redirect("/me");
  if (ctx.profile?.role !== "admin" && ctx.pendingRequest) redirect("/pending");

  const db = createAdminClient();
  const [inviteIndex, identities] = ctx.accountsReady
    ? await Promise.all([loadInviteIndex(db), loadLinkedIdentities()])
    : [null, new Map()] as const;
  const inviteOptions = inviteIndex
    ? inviteOptionsFromIndex(inviteIndex, identities)
    : [];

  return (
    <AuthShell
      wide
      title="Register"
      subtitle="For people who are not on the team list yet. Already on the team? Claim your name instead."
    >
      {ctx.profile?.role === "admin" ? (
        <SignedInAsAdminNotice stayHref="/register" />
      ) : null}
      {!ctx.accountsReady ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Player accounts are not enabled yet. Ask the admin to run the latest
          database update.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <AccountRequestForm
            action={submitRegister}
            kind="register"
            defaultEmail={ctx.user?.email ?? undefined}
            needPassword={!ctx.user}
            submitLabel="Submit registration"
            inviteOptions={inviteOptions}
          />
        </div>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/claim" className={buttonClass("ghost")}>
          Claim an existing name
        </Link>
      </p>
    </AuthShell>
  );
}
