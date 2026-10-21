import type { SupabaseClient, User } from "@supabase/supabase-js";
import { logAdminAction } from "@/lib/activity-log";
import { formatMoney, phTodayYmd } from "@/lib/format";
import { nextCode } from "@/lib/ledger";
import {
  computeBookingShareRemaining,
  computeClubFundShareRemaining,
} from "@/lib/payment-allocation";
import { planAdminSharePayments } from "@/lib/admin-share-payment";

export type RecordedAdminPayment = {
  playerId: string;
  playerName: string;
  code: string;
  amount: number;
  bookingId: string;
};

type RecordResult =
  | { ok: true; payments: RecordedAdminPayment[] }
  | { ok: false; error: string; payments: RecordedAdminPayment[] };

/**
 * Record a real payment for each club admin's still-open court share and
 * club-item share on a booking. Credits the wallet that was charged, so the
 * booking's Player shares & payments row shows paid. Already-settled shares
 * are skipped.
 */
export async function recordClubAdminSharePayments(
  db: SupabaseClient,
  bookingId: string,
  actor: User | null = null,
): Promise<RecordResult> {
  const { data: admins, error: adminErr } = await db
    .from("user_profiles")
    .select("player_id")
    .eq("role", "admin")
    .not("player_id", "is", null);
  if (adminErr) return { ok: false, error: adminErr.message, payments: [] };
  const adminIds = [
    ...new Set(
      (admins ?? [])
        .map((row) => row.player_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (adminIds.length === 0) return { ok: true, payments: [] };

  const { data: booking, error: bookingErr } = await db
    .from("bookings")
    .select("id, play_date, booking_code")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr) return { ok: false, error: bookingErr.message, payments: [] };
  if (!booking) return { ok: true, payments: [] };

  const { data: courtShares, error: courtErr } = await db
    .from("booking_shares")
    .select("id, player_id, booking_id")
    .eq("booking_id", bookingId)
    .in("player_id", adminIds);
  if (courtErr) return { ok: false, error: courtErr.message, payments: [] };

  const { data: fundEntries, error: fundErr } = await db
    .from("club_fund_entries")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("voided", false);
  if (fundErr) return { ok: false, error: fundErr.message, payments: [] };
  const entryIds = (fundEntries ?? []).map((row) => row.id as string);

  const clubShares: { id: string; player_id: string }[] = [];
  if (entryIds.length > 0) {
    const { data, error } = await db
      .from("club_fund_shares")
      .select("id, player_id")
      .in("fund_entry_id", entryIds)
      .in("player_id", adminIds);
    if (error) return { ok: false, error: error.message, payments: [] };
    for (const row of data ?? []) {
      if (row.player_id) {
        clubShares.push({
          id: row.id as string,
          player_id: row.player_id as string,
        });
      }
    }
  }

  const court = (courtShares ?? []).filter((row) => row.player_id);
  if (court.length === 0 && clubShares.length === 0) {
    return { ok: true, payments: [] };
  }

  const playDate = (booking.play_date as string | null) || phTodayYmd();
  const dateMap = new Map<string, string>([[bookingId, playDate]]);
  const [courtRemaining, clubRemaining] = await Promise.all([
    computeBookingShareRemaining(
      db,
      court.map((row) => ({
        id: row.id as string,
        booking_id: bookingId,
        player_id: row.player_id as string,
      })),
      dateMap,
      phTodayYmd(),
    ),
    computeClubFundShareRemaining(
      db,
      clubShares.map((row) => row.id),
    ),
  ]);

  const openIds: { id: string; playerId: string; remaining: number }[] = [];
  for (const row of court) {
    const remaining = courtRemaining.get(row.id as string) ?? 0;
    if (remaining > 0) {
      openIds.push({
        id: row.id as string,
        playerId: row.player_id as string,
        remaining,
      });
    }
  }
  for (const row of clubShares) {
    const remaining = clubRemaining.get(row.id) ?? 0;
    if (remaining > 0) {
      openIds.push({ id: row.id, playerId: row.player_id, remaining });
    }
  }
  if (openIds.length === 0) return { ok: true, payments: [] };

  const { data: ledgerRows, error: ledgerErr } = await db
    .from("ledger_entries")
    .select("source_id, player_id, player_group_id")
    .in(
      "source_id",
      openIds.map((row) => row.id),
    )
    .eq("voided", false)
    .gt("debit_amount", 0);
  if (ledgerErr) return { ok: false, error: ledgerErr.message, payments: [] };

  const walletBySource = new Map<
    string,
    { player_id: string | null; player_group_id: string | null }
  >();
  for (const row of ledgerRows ?? []) {
    const sourceId = row.source_id as string | null;
    if (!sourceId || walletBySource.has(sourceId)) continue;
    walletBySource.set(sourceId, {
      player_id: (row.player_id as string | null) ?? null,
      player_group_id: (row.player_group_id as string | null) ?? null,
    });
  }

  const plan = planAdminSharePayments(
    openIds.map((row) => {
      const wallet = walletBySource.get(row.id);
      return {
        playerId: row.playerId,
        walletPlayerId: wallet?.player_id ?? null,
        walletGroupId: wallet?.player_group_id ?? null,
        remaining: row.remaining,
      };
    }),
  );
  if (plan.length === 0) return { ok: true, payments: [] };

  const { data: playerRows } = await db
    .from("players")
    .select("id, name")
    .in(
      "id",
      plan.map((row) => row.playerId),
    );
  const names = new Map(
    (playerRows ?? []).map((row) => [
      row.id as string,
      (row.name as string) || "Player",
    ]),
  );
  const bookingCode = (booking.booking_code as string | null) || "booking";
  const recorded: RecordedAdminPayment[] = [];

  for (const row of plan) {
    const code = await nextCode(db, "payments", "payment_code", "PAY");
    const { data: pay, error: payErr } = await db
      .from("payments")
      .insert({
        payment_code: code,
        payment_date: playDate,
        payer_player_id: row.playerId,
        payer_group_id: null,
        booking_id: bookingId,
        amount: row.amount,
        notes: "Club admin share marked paid",
      })
      .select("id")
      .single();
    if (payErr || !pay?.id) {
      return {
        ok: false,
        error: payErr?.message ?? "Could not record payment.",
        payments: recorded,
      };
    }

    const { error: creditErr } = await db.from("ledger_entries").insert({
      entry_date: playDate,
      player_id: row.walletPlayerId,
      player_group_id: row.walletGroupId,
      source_type: "payment",
      source_id: pay.id,
      description: `Payment ${code} (booking)`,
      debit_amount: 0,
      credit_amount: row.amount,
    });
    if (creditErr) {
      await db.from("payments").delete().eq("id", pay.id);
      return { ok: false, error: creditErr.message, payments: recorded };
    }

    const playerName = names.get(row.playerId) ?? "Player";
    recorded.push({
      playerId: row.playerId,
      playerName,
      code,
      amount: row.amount,
      bookingId,
    });
    const details = `${code} · ${bookingCode}`;
    await logAdminAction(db, actor, {
      entityType: "player",
      entityId: row.playerId,
      action: `Recorded ${formatMoney(row.amount)} club admin share payment`,
      details,
    });
    await logAdminAction(db, actor, {
      entityType: "booking",
      entityId: bookingId,
      action: `Recorded ${formatMoney(row.amount)} club admin share payment for ${playerName}`,
      details,
    });
  }

  return { ok: true, payments: recorded };
}
