import { NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { isMissingRelation } from "@/lib/account-fields";
import { canBeAutoGoing } from "@/lib/auto-rsvp";

export const dynamic = "force-dynamic";

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const body = (await request.json().catch(() => null)) as {
    playerId?: unknown;
    enabled?: unknown;
  } | null;
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  const enabled = body?.enabled;
  if (!PLAYER_ID.test(playerId) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!canBeAutoGoing(playerId)) {
    return NextResponse.json(
      { error: "Only Lester and Donna can use Auto Going." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("players")
    .update({ auto_rsvp_going: enabled })
    .eq("id", playerId)
    .select("id");

  if (error && isMissingRelation(error)) {
    return NextResponse.json(
      {
        error:
          "Auto Going cannot be saved until the database update is applied.",
      },
      { status: 409 },
    );
  }
  if (error) {
    return NextResponse.json(
      { error: "Could not save Auto Going." },
      { status: 500 },
    );
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Player not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, enabled });
}
