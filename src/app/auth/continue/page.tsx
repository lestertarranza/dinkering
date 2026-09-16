import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { postLoginPath, safeNextPath } from "@/lib/account-fields";

export const dynamic = "force-dynamic";

export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextRaw } = await searchParams;
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login");
  const next = safeNextPath(nextRaw ?? null);
  const waiting =
    !!ctx.pendingRequest ||
    (!ctx.playerToken && ctx.latestRequest?.status === "rejected");
  redirect(
    postLoginPath({
      role: ctx.profile?.role ?? (ctx.accountsReady ? "player" : "admin"),
      playerToken: ctx.playerToken,
      pending: waiting,
      next,
    }),
  );
}
