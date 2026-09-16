import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { SignOutButton } from "@/components/SignOutButton";
import { buttonClass } from "@/components/ui";
import { formatPhMobile } from "@/lib/phone";
import { playerFullName } from "@/lib/account-fields";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login");
  if (ctx.profile?.role === "admin") redirect("/admin");
  if (ctx.profile?.player_id) redirect("/me");

  const pending = ctx.pendingRequest;
  const latest = ctx.latestRequest;
  const rejected = !pending && latest?.status === "rejected";

  return (
    <AuthShell
      title={pending ? "Waiting for approval" : rejected ? "Request not approved" : "No request yet"}
      subtitle={
        pending
          ? "You can still use your private page link until the admin reviews this."
          : undefined
      }
    >
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {pending ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-800">
                {pending.kind === "claim" ? "Claim" : "New registration"}
              </span>{" "}
              for {playerFullName(pending.first_name, pending.last_name)}
            </p>
            <p>{pending.email}</p>
            <p>{formatPhMobile(pending.phone)}</p>
            {pending.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pending.avatar_url}
                alt=""
                className="mt-2 h-20 w-20 rounded-full object-cover"
              />
            ) : null}
          </div>
        ) : rejected ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>This request was not approved.</p>
            {latest?.reject_reason ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
                {latest.reject_reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link href="/register" className={buttonClass("primary")}>
                Register again
              </Link>
              <Link href="/claim" className={buttonClass("secondary")}>
                Claim a name
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>There is no request on this login yet.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/register" className={buttonClass("primary")}>
                Register
              </Link>
              <Link href="/claim" className={buttonClass("secondary")}>
                Claim a name
              </Link>
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </AuthShell>
  );
}
