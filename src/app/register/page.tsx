import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { AccountRequestForm } from "@/components/AccountRequestForm";
import { submitRegister } from "@/app/auth/actions";
import { buttonClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const ctx = await getAuthContext();
  if (ctx.profile?.role === "admin") redirect("/admin");
  if (ctx.profile?.player_id) redirect("/me");
  if (ctx.pendingRequest) redirect("/pending");

  return (
    <AuthShell
      wide
      title="Register"
      subtitle="For people who are not on the team list yet. Already on the team? Claim your name instead."
    >
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
