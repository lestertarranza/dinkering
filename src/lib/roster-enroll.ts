import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

/** Add an active player to every upcoming booking roster (no-op if already there). */
export async function enrollPlayerInUpcomingBookings(
  db: SupabaseClient,
  playerId: string,
): Promise<void> {
  const { data: bookings } = await db
    .from("bookings")
    .select("id")
    .in("status", ["booked", "for_booking"]);
  const rows = (bookings ?? []).map((b) => ({
    booking_id: b.id as string,
    player_id: playerId,
    response_status: "no_response" as const,
  }));
  if (rows.length === 0) return;
  await db.from("booking_attendance").upsert(rows, {
    onConflict: "booking_id,player_id",
    ignoreDuplicates: true,
  });
  for (const b of bookings ?? []) revalidatePath(`/admin/bookings/${b.id}`);
  revalidatePath("/admin/bookings");
}
