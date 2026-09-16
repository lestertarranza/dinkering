import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { ClaimFlow } from "@/components/ClaimFlow";
import { buttonClass } from "@/components/ui";
import { SignedInAsAdminNotice } from "@/components/SignedInAsAdminNotice";

export const dynamic = "force-dynamic";

export default async function ClaimPage() {
  const ctx = await getAuthContext();
  if (ctx.profile?.player_id) redirect("/me");
  if (ctx.profile?.role !== "admin" && ctx.pendingRequest) redirect("/pending");

  return (
    <AuthShell
      wide
      title="Claim your name"
      subtitle="Lost your private link? Search for yourself. The admin still has to approve it."
    >
      {ctx.profile?.role === "admin" ? (
        <SignedInAsAdminNotice stayHref="/claim" mode="claim" />
      ) : null}
      {!ctx.accountsReady ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Player accounts are not enabled yet. Ask the admin to run the latest
          database update.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ClaimFlow
            defaultEmail={ctx.user?.email ?? undefined}
            needPassword={!ctx.user}
            submitLabel={
              ctx.profile?.role === "admin"
                ? "Link this name to my login"
                : "Submit claim"
            }
          />
        </div>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        Not on the list yet?{" "}
        <Link href="/register" className={buttonClass("ghost")}>
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
