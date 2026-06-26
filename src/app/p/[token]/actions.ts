"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResponseStatus } from "@/lib/types";

/** Player RSVP from the public portal — validated by share token. */
export async function submitRsvp(formData: FormData) {
  const token = String(formData.get("token") || "");
  const booking_id = String(formData.get("booking_id") || "");
  const requested = String(formData.get("response_status") || "") as ResponseStatus;
  if (!token || !booking_id) return;

  const db = createAdminClient();
  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("public_token", token)
    .single();
  if (!player) return;

  // ── Capacity / waitlist check ────────────────────────────────────────────
  let response_status = requested;
  if (requested === "going") {
    // Total capacity = sum of per-court max_players (0 = unlimited).
    const { data: courts } = await db
      .from("booking_courts")
      .select("max_players")
      .eq("booking_id", booking_id);
    const courtList = (courts ?? []) as { max_players: number }[];
    const isUnlimited =
      courtList.length === 0 || courtList.some((c) => c.max_players === 0);
    if (!isUnlimited) {
      const totalCap = courtList.reduce((s, c) => s + c.max_players, 0);
      const { count: goingCount } = await db
        .from("booking_attendance")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", booking_id)
        .eq("response_status", "going");
      if ((goingCount ?? 0) >= totalCap) {
        response_status = "waitlist"; // capacity full — put on waitlist
      }
    }
  }

  // Get previous status to detect cancellation.
  const { data: existing } = await db
    .from("booking_attendance")
    .select("response_status")
    .eq("booking_id", booking_id)
    .eq("player_id", player.id)
    .single();
  const prevStatus = existing?.response_status as ResponseStatus | undefined;

  await db
    .from("booking_attendance")
    .upsert(
      { booking_id, player_id: player.id, response_status },
      { onConflict: "booking_id,player_id" },
    );

  // ── Auto-promote waitlist on cancellation ────────────────────────────────
  // If someone was "going" and is now no longer going, a slot opens up.
  const wasCancelled =
    prevStatus === "going" &&
    response_status !== "going" &&
    response_status !== "waitlist";

  if (wasCancelled) {
    // Find the oldest waitlisted player and promote them.
    const { data: courts } = await db
      .from("booking_courts")
      .select("max_players")
      .eq("booking_id", booking_id);
    const courtList = (courts ?? []) as { max_players: number }[];
    const isUnlimited =
      courtList.length === 0 || courtList.some((c) => c.max_players === 0);

    const { data: next } = await db
      .from("booking_attendance")
      .select("id")
      .eq("booking_id", booking_id)
      .eq("response_status", "waitlist")
      .order("created_at")
      .limit(isUnlimited ? 999 : 1);

    if (next && next.length > 0) {
      await db
        .from("booking_attendance")
        .update({ response_status: "going" as ResponseStatus })
        .in("id", next.map((r) => r.id as string));
    }
  }

  revalidatePath(`/p/${token}`);
}
