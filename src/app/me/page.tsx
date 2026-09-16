import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { postLoginPath } from "@/lib/account-fields";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login?next=/me");
  const waiting =
    !!ctx.pendingRequest ||
    (!ctx.playerToken && ctx.latestRequest?.status === "rejected");
  redirect(
    postLoginPath({
      role: ctx.profile?.role ?? (ctx.accountsReady ? "player" : "admin"),
      playerToken: ctx.playerToken,
      pending: waiting,
      next: "/admin",
    }),
  );
}
