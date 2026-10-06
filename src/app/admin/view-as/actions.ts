"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

const PLAYER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startViewAs(formData: FormData) {
  await requireAdmin();
  const playerId = String(formData.get("player_id") || "");
  if (!PLAYER_ID_RE.test(playerId)) redirect("/admin/players");
  const admin = createAdminClient();
  const { data } = await admin
    .from("players")
    .select("id, public_token")
    .eq("id", playerId)
    .maybeSingle();
  if (!data?.public_token) redirect("/admin/players");
  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, data.id as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect(`/p/${data.public_token}`);
}

export async function stopViewAs() {
  await requireAdmin();
  const jar = await cookies();
  const id = jar.get(VIEW_AS_COOKIE)?.value ?? "";
  jar.delete(VIEW_AS_COOKIE);
  redirect(PLAYER_ID_RE.test(id) ? `/admin/players/${id}` : "/admin/players");
}
