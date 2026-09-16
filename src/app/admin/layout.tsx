import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { pendingRequestCount } from "@/lib/accounts";
import { AdminNav } from "@/components/AdminNav";
import { AdminHotkeys } from "@/components/AdminHotkeys";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (!ctx.user) redirect("/login");
  if (ctx.accountsReady && ctx.profile?.role !== "admin") {
    redirect("/auth/continue");
  }

  const pendingCount = ctx.accountsReady ? await pendingRequestCount() : 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminNav
        email={ctx.user.email ?? null}
        pendingCount={pendingCount}
        playerToken={ctx.playerToken}
      />
      <AdminHotkeys />
      <main className="flex-1 overflow-x-hidden px-4 py-5 pb-24 sm:px-6 lg:px-8 md:pb-5">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
