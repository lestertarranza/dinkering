import { cache } from "react";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";

export const VIEW_AS_COOKIE = "dinkering_view_as";

const PLAYER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminViewAs = {
  playerId: string;
  name: string;
  token: string;
};

/** The player a signed-in club admin has chosen to view and act as. */
export const getAdminViewAs = cache(async function getAdminViewAs(): Promise<AdminViewAs | null> {
  const auth = await getAuthContext();
  if (!auth.user || auth.profile?.role !== "admin") return null;
  const jar = await cookies();
  const id = jar.get(VIEW_AS_COOKIE)?.value ?? "";
  if (!PLAYER_ID_RE.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("players")
    .select("id, name, public_token")
    .eq("id", id)
    .maybeSingle();
  if (!data?.public_token) return null;
  return {
    playerId: data.id as string,
    name: (data.name as string) || "Player",
    token: data.public_token as string,
  };
});
