import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { buttonClass, Card } from "@/components/ui";
import { SignOutButton } from "@/components/SignOutButton";
import { formatPhMobile } from "@/lib/phone";
import { AccountSettingsForm } from "./AccountSettingsForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login?next=/account");
  if (ctx.pendingRequest && !ctx.profile?.player_id) redirect("/pending");
  if (!ctx.profile?.player_id || !ctx.playerToken || !ctx.user) {
    redirect(ctx.profile?.role === "admin" ? "/admin" : "/register");
  }

  const p = ctx.profile;
  const isAdmin = p.role === "admin";

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">My account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Phone and photo on this login.
        </p>
      </div>
      <Card className="p-6">
        <AccountSettingsForm
          firstName={p.first_name}
          lastName={p.last_name}
          email={ctx.user.email ?? ""}
          phone={formatPhMobile(p.phone)}
          avatarUrl={p.avatar_url}
        />
      </Card>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={`/p/${ctx.playerToken}`} className={buttonClass("secondary")}>
          My player page
        </Link>
        {isAdmin ? (
          <Link href="/admin" className={buttonClass("secondary")}>
            Dashboard
          </Link>
        ) : null}
        <SignOutButton />
      </div>
    </main>
  );
}
