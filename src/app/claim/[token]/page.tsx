import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthShell } from "@/components/AuthShell";
import { ClaimFlow } from "@/components/ClaimFlow";
import { getPlayerLink } from "@/lib/accounts";
import { buttonClass } from "@/components/ui";
import { SignedInAsAdminNotice } from "@/components/SignedInAsAdminNotice";
import type { Player } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClaimByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await getAuthContext();
  if (ctx.profile?.player_id) redirect("/me");
  if (ctx.profile?.role !== "admin" && ctx.pendingRequest) redirect("/pending");

  const db = createAdminClient();
  const { data: player } = await db
    .from("players")
    .select("id, name, display_name, public_token, active_status")
    .eq("public_token", token)
    .maybeSingle();
  if (!player) notFound();
  const p = player as Pick<
    Player,
    "id" | "name" | "display_name" | "public_token" | "active_status"
  >;
  if (p.active_status === "archived") notFound();

  const link = await getPlayerLink(p.id);

  return (
    <AuthShell
      wide
      title="Set up my login"
      subtitle={`Claim ${p.display_name?.trim() || p.name}. The admin will confirm it is you.`}
    >
      {ctx.profile?.role === "admin" ? (
        <SignedInAsAdminNotice stayHref={`/claim/${token}`} mode="claim" />
      ) : null}
      {!ctx.accountsReady ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Player accounts are not enabled yet. Ask the admin to run the latest
          database update.
        </p>
      ) : link.linked ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          <p>This name already has a login.</p>
          <Link href="/login" className={`${buttonClass("primary")} mt-4`}>
            Sign in
          </Link>
        </div>
      ) : link.pendingClaim ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          A login request for this name is already waiting for the admin.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <ClaimFlow
            preset={{
              id: p.id,
              name: p.name,
              display_name: p.display_name,
            }}
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
        <Link href={`/p/${token}`} className={buttonClass("ghost")}>
          Back to player page
        </Link>
      </p>
    </AuthShell>
  );
}
