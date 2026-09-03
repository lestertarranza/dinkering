import type { SupabaseClient, User } from "@supabase/supabase-js";

export type ActivityEntity =
  | "player"
  | "booking"
  | "payment"
  | "expense"
  | "group";

export async function logAdminAction(
  db: SupabaseClient,
  user: User | null,
  opts: {
    entityType: ActivityEntity;
    entityId: string | null;
    action: string;
    details?: string | null;
  },
): Promise<void> {
  try {
    await db.from("admin_activity").insert({
      actor_email: user?.email ?? null,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      action: opts.action,
      details: opts.details ?? null,
    });
  } catch {
    // Activity logging must never block the admin action itself.
  }
}

export type ActivityRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  entity_type: ActivityEntity;
  entity_id: string | null;
  action: string;
  details: string | null;
};

export async function fetchActivity(
  db: SupabaseClient,
  entityType: ActivityEntity,
  entityId: string,
  limit = 20,
): Promise<ActivityRow[]> {
  try {
    const { data } = await db
      .from("admin_activity")
      .select("id, created_at, actor_email, entity_type, entity_id, action, details")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as ActivityRow[];
  } catch {
    return [];
  }
}
