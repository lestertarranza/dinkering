import type { SupabaseClient } from "@supabase/supabase-js";

/** Validate the shared team token from app_settings. */
export async function validatePublicTeamToken(
  db: SupabaseClient,
  token: string,
): Promise<boolean> {
  const { data: settings } = await db
    .from("app_settings")
    .select("roster_token, roster_public")
    .single();
  return !!(
    settings?.roster_public &&
    settings.roster_token === token
  );
}

/** Display label for a player on public pages. */
export function publicPlayerLabel(p: {
  name: string;
  display_name: string | null;
}): string {
  return p.display_name?.trim() || p.name;
}
