import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityEntity =
  | "player"
  | "booking"
  | "payment"
  | "expense"
  | "group";

function actorLabel(user: User | null, fallback?: string | null): string | null {
  return user?.email ?? fallback ?? null;
}

/**
 * Write an activity row. Uses the service-role client so RLS never silently
 * drops the insert. Failures are ignored so they never block the real action.
 */
export async function logAdminAction(
  _db: SupabaseClient | null,
  user: User | null,
  opts: {
    entityType: ActivityEntity;
    entityId: string | null;
    action: string;
    details?: string | null;
  },
): Promise<void> {
  try {
    const db = createAdminClient();
    await db.from("admin_activity").insert({
      actor_email: actorLabel(user),
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      action: opts.action,
      details: opts.details ?? null,
    });
  } catch {
    // Activity logging must never block the action itself.
  }
}

/** Log an RSVP change on both the player and the booking so either page shows it. */
export async function logRsvpChange(opts: {
  playerId: string;
  bookingId: string;
  playerName?: string | null;
  bookingCode?: string | null;
  from: string;
  to: string;
  actorEmail?: string | null;
  via: "player" | "admin";
}): Promise<void> {
  const who = opts.playerName?.trim() || "Player";
  const game = opts.bookingCode?.trim() || "a game";
  const via = opts.via === "player" ? "player page" : "admin";
  const action = `${who} RSVP on ${game}: ${label(opts.from)} → ${label(opts.to)}`;
  const details = `via ${via}`;
  try {
    const db = createAdminClient();
    await db.from("admin_activity").insert([
      {
        actor_email: opts.actorEmail ?? (opts.via === "player" ? who : null),
        entity_type: "player",
        entity_id: opts.playerId,
        action,
        details,
      },
      {
        actor_email: opts.actorEmail ?? (opts.via === "player" ? who : null),
        entity_type: "booking",
        entity_id: opts.bookingId,
        action,
        details,
      },
    ]);
  } catch {
    // ignore
  }
}

function label(status: string): string {
  if (status === "going") return "Going";
  if (status === "not_going") return "Not going";
  if (status === "waitlist") return "Waitlist";
  if (status === "no_response") return "No response";
  return status;
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
  limit = 30,
): Promise<ActivityRow[]> {
  const { data, error } = await db
    .from("admin_activity")
    .select("id, created_at, actor_email, entity_type, entity_id, action, details")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as ActivityRow[];
}
