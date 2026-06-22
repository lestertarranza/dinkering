"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResponseStatus } from "@/lib/types";

/** Player RSVP from the public portal — validated by share token. */
export async function submitRsvp(formData: FormData) {
  const token = String(formData.get("token") || "");
  const booking_id = String(formData.get("booking_id") || "");
  const response_status = String(
    formData.get("response_status") || "",
  ) as ResponseStatus;
  if (!token || !booking_id) return;

  const db = createAdminClient();
  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("public_token", token)
    .single();
  if (!player) return;

  await db
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id: player.id, response_status },
      { onConflict: "booking_id,player_id" },
    );

  revalidatePath(`/p/${token}`);
}
