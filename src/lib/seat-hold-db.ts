import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelation } from "@/lib/account-fields";
import { phTodayYmd } from "@/lib/format";
import { resolveWalletOwner, round2 } from "@/lib/ledger";
import {
  isSeatStatus,
  parseHoldFee,
  seatHoldBlockReason,
  seatHoldMoveProblem,
} from "@/lib/seat-hold";

type Db = SupabaseClient;

let readyCache: boolean | undefined;

export async function seatHoldsReady(db: Db): Promise<boolean> {
  if (readyCache === true) return true;
  const { error } = await db.from("bookings").select("hold_fee").limit(1);
  readyCache = !error;
  return readyCache;
}

async function walletBalance(
  db: Db,
  owner: { player_id: string | null; player_group_id: string | null },
): Promise<number> {
  if (owner.player_group_id) {
    const { data } = await db
      .from("group_balances")
      .select("balance")
      .eq("player_group_id", owner.player_group_id)
      .maybeSingle();
    return Number(data?.balance ?? 0);
  }
  if (!owner.player_id) return 0;
  const { data } = await db
    .from("player_balances")
    .select("balance")
    .eq("player_id", owner.player_id)
    .maybeSingle();
  return Number(data?.balance ?? 0);
}

async function postHoldLedger(
  db: Db,
  opts: {
    owner: { player_id: string | null; player_group_id: string | null };
    holdId: string;
    amount: number;
    description: string;
    direction: "debit" | "credit";
  },
) {
  const amount = round2(opts.amount);
  await db.from("ledger_entries").insert({
    entry_date: phTodayYmd(),
    player_id: opts.owner.player_id,
    player_group_id: opts.owner.player_group_id,
    source_type: "manual_adjustment",
    source_id: opts.holdId,
    description: opts.description,
    debit_amount: opts.direction === "debit" ? amount : 0,
    credit_amount: opts.direction === "credit" ? amount : 0,
  });
}

type HoldRow = {
  id: string;
  amount: number;
  status: string;
  player_group_id: string | null;
};

async function openHold(
  db: Db,
  bookingId: string,
  playerId: string,
): Promise<HoldRow | null> {
  const { data, error } = await db
    .from("seat_holds")
    .select("id, amount, status, player_group_id")
    .eq("booking_id", bookingId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as HoldRow;
}

async function creditHoldBack(
  db: Db,
  opts: {
    hold: HoldRow;
    playerId: string;
    bookingCode: string | null;
    description: string;
    status: "returned" | "applied";
  },
) {
  const owner = {
    player_id: opts.hold.player_group_id ? null : opts.playerId,
    player_group_id: opts.hold.player_group_id,
  };
  await postHoldLedger(db, {
    owner,
    holdId: opts.hold.id,
    amount: Number(opts.hold.amount),
    description: opts.description,
    direction: "credit",
  });
  await db
    .from("seat_holds")
    .update({ status: opts.status })
    .eq("id", opts.hold.id)
    .eq("status", "open");
}

/**
 * Take or return a seat hold when RSVP changes.
 * Admin and Auto Going passes waived so no money moves onto a new seat.
 * Returns an error message when the player must stay on their old RSVP.
 */
export async function syncSeatHold(
  db: Db,
  opts: {
    bookingId: string;
    playerId: string;
    nextStatus: string;
    prevStatus: string;
    waived: boolean;
    bookingCode?: string | null;
    playDate?: string | null;
  },
): Promise<string | null> {
  if (!(await seatHoldsReady(db))) return null;
  const { data: booking } = await db
    .from("bookings")
    .select("hold_fee, booking_code, play_date")
    .eq("id", opts.bookingId)
    .maybeSingle();
  const parsed = parseHoldFee(booking?.hold_fee ?? "");
  const code =
    opts.bookingCode ??
    (booking?.booking_code as string | null) ??
    "this game";
  const playDate =
    opts.playDate ?? (booking?.play_date as string | null) ?? phTodayYmd();
  const existing = await openHold(db, opts.bookingId, opts.playerId);
  const alreadyHeld = existing?.status === "open";
  const nextSeat = isSeatStatus(opts.nextStatus);
  const prevSeat = isSeatStatus(opts.prevStatus);

  if (opts.waived) {
    if (!nextSeat && prevSeat && alreadyHeld && existing) {
      await creditHoldBack(db, {
        hold: existing,
        playerId: opts.playerId,
        bookingCode: code,
        description: `Seat hold returned ${code}`,
        status: "returned",
      });
    }
    await db
      .from("booking_attendance")
      .update({ hold_waived: true })
      .eq("booking_id", opts.bookingId)
      .eq("player_id", opts.playerId);
    return null;
  }

  if (nextSeat) {
    if (existing?.status === "applied") return null;
    if (alreadyHeld) return null;
    if (!parsed.ok) {
      return "This game does not have a hold fee yet. Ask a club admin to set it before you RSVP.";
    }
    const owner = await resolveWalletOwner(db, opts.playerId, playDate);
    const balance = await walletBalance(db, owner);
    const blocked = seatHoldBlockReason({
      balance,
      holdFee: parsed.fee,
      alreadyHeld: false,
      sharedWallet: Boolean(owner.player_group_id),
    });
    if (blocked) return blocked;

    const row = {
      booking_id: opts.bookingId,
      player_id: opts.playerId,
      player_group_id: owner.player_group_id,
      amount: parsed.fee,
      status: "open",
    };
    const saved = existing
      ? await db.from("seat_holds").update(row).eq("id", existing.id).select("id").single()
      : await db.from("seat_holds").insert(row).select("id").single();
    if (saved.error || !saved.data?.id) {
      return "Could not save the seat hold. Try again.";
    }
    await postHoldLedger(db, {
      owner,
      holdId: saved.data.id as string,
      amount: parsed.fee,
      description: `Seat hold ${code}`,
      direction: "debit",
    });
    await db
      .from("booking_attendance")
      .update({ hold_waived: false })
      .eq("booking_id", opts.bookingId)
      .eq("player_id", opts.playerId);
    return null;
  }

  if (prevSeat && alreadyHeld && existing) {
    await creditHoldBack(db, {
      hold: existing,
      playerId: opts.playerId,
      bookingCode: code,
      description: `Seat hold returned ${code}`,
      status: "returned",
    });
  }
  return null;
}

/** Give open holds back when a booking is cancelled or refunded. */
export async function releaseBookingHolds(db: Db, bookingId: string): Promise<void> {
  if (!(await seatHoldsReady(db))) return;
  const { data: booking } = await db
    .from("bookings")
    .select("booking_code")
    .eq("id", bookingId)
    .maybeSingle();
  const code = (booking?.booking_code as string | null) ?? "this game";
  const { data } = await db
    .from("seat_holds")
    .select("id, amount, status, player_group_id, player_id")
    .eq("booking_id", bookingId)
    .eq("status", "open");
  for (const hold of (data ?? []) as (HoldRow & { player_id: string })[]) {
    await creditHoldBack(db, {
      hold,
      playerId: hold.player_id,
      bookingCode: code,
      description: `Seat hold returned ${code}`,
      status: "returned",
    });
  }
}

/**
 * After shares are posted, apply open holds toward those charges.
 * Players who were not charged get the hold back as credit.
 */
export async function reconcileHoldsAfterShares(
  db: Db,
  bookingId: string,
  chargedPlayerIds: Iterable<string>,
): Promise<void> {
  if (!(await seatHoldsReady(db))) return;
  const charged = new Set(chargedPlayerIds);
  const { data: booking } = await db
    .from("bookings")
    .select("booking_code")
    .eq("id", bookingId)
    .maybeSingle();
  const code = (booking?.booking_code as string | null) ?? "this game";
  const { data } = await db
    .from("seat_holds")
    .select("id, amount, status, player_group_id, player_id")
    .eq("booking_id", bookingId)
    .eq("status", "open");
  for (const hold of (data ?? []) as (HoldRow & { player_id: string })[]) {
    const applied = charged.has(hold.player_id);
    await creditHoldBack(db, {
      hold,
      playerId: hold.player_id,
      bookingCode: code,
      description: applied
        ? `Seat hold applied ${code}`
        : `Seat hold returned ${code}`,
      status: applied ? "applied" : "returned",
    });
  }
}

export async function bookedHoldError(
  db: Db,
  bookingId: string,
  holdFeeRaw: unknown,
): Promise<string | null> {
  if (!(await seatHoldsReady(db))) return null;
  const parsed = parseHoldFee(holdFeeRaw);
  if (!parsed.ok) return parsed.error;
  const { data: roster } = await db
    .from("booking_attendance")
    .select("player_id, response_status, hold_waived, players(name)")
    .eq("booking_id", bookingId);
  const { data: holds } = await db
    .from("seat_holds")
    .select("player_id")
    .eq("booking_id", bookingId)
    .eq("status", "open");
  const open = new Set((holds ?? []).map((h) => h.player_id as string));
  const missing: string[] = [];
  for (const row of (roster ?? []) as {
    player_id: string;
    response_status: string;
    hold_waived?: boolean | null;
    players: { name: string } | { name: string }[] | null;
  }[]) {
    if (!isSeatStatus(row.response_status) || row.hold_waived) continue;
    if (open.has(row.player_id)) continue;
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    missing.push(player?.name ?? "A player");
  }
  if (missing.length === 0) return null;
  return `These players still need a seat hold before the game can be marked Booked: ${missing.join(", ")}.`;
}

export async function openHoldTotal(db: Db, bookingId: string): Promise<number | null> {
  if (!(await seatHoldsReady(db))) return null;
  const { data, error } = await db
    .from("seat_holds")
    .select("amount")
    .eq("booking_id", bookingId)
    .eq("status", "open");
  if (error && isMissingRelation(error)) return null;
  return round2(
    (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
}

export type SeatHoldMove = {
  playerId: string;
  playerName: string;
  amount: number;
  sourceBookingId: string;
  destBookingId: string;
  sourceCode: string;
  destCode: string;
  applied: boolean;
  /** RSVP that was cleared on the source game, if they were Going or waitlist. */
  clearedFrom: string | null;
  rsvpWarning: string | null;
};

/**
 * Move one open seat hold onto another game.
 * If that game already has a share for this player, the hold is applied
 * the same way share generation consumes a hold: the set-aside is credited
 * back so the share is the real charge.
 * Going or waitlist on the source game is cleared, because that seat no
 * longer has a hold.
 */
export async function moveOpenSeatHold(
  db: Db,
  opts: { holdId: string; destBookingId: string },
): Promise<{ ok: true; move: SeatHoldMove } | { ok: false; error: string }> {
  if (!(await seatHoldsReady(db))) {
    return { ok: false, error: "Seat holds are not set up yet." };
  }
  const holdId = opts.holdId.trim();
  const destBookingId = opts.destBookingId.trim();
  if (!holdId || !destBookingId) {
    return { ok: false, error: "Pick the hold and the game to move it to." };
  }

  const { data: hold, error: holdError } = await db
    .from("seat_holds")
    .select("id, booking_id, player_id, amount, status, player_group_id")
    .eq("id", holdId)
    .maybeSingle();
  if (holdError || !hold) return { ok: false, error: "That seat hold was not found." };

  const sourceBookingId = hold.booking_id as string;
  const playerId = hold.player_id as string;
  const { data: bookings, error: bookingError } = await db
    .from("bookings")
    .select("id, booking_code, status")
    .in("id", [sourceBookingId, destBookingId]);
  if (bookingError) return { ok: false, error: "Could not load those games." };
  const source = (bookings ?? []).find((b) => b.id === sourceBookingId);
  const dest = (bookings ?? []).find((b) => b.id === destBookingId);
  if (!source || !dest) return { ok: false, error: "That game was not found." };

  const { data: destHold, error: destHoldError } = await db
    .from("seat_holds")
    .select("status")
    .eq("booking_id", destBookingId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (destHoldError) {
    return { ok: false, error: "Could not check the destination game." };
  }
  const problem = seatHoldMoveProblem({
    holdStatus: String(hold.status),
    sourceBookingId,
    destBookingId,
    destBookingStatus: String(dest.status),
    destHoldStatus: (destHold?.status as string | undefined) ?? null,
  });
  if (problem) return { ok: false, error: problem };

  const sourceCode = (source.booking_code as string | null) ?? "the original game";
  const destCode = (dest.booking_code as string | null) ?? "the other game";
  const sourceDesc = `Seat hold ${sourceCode}`;
  const destDesc = `Seat hold ${destCode}`;

  const { data: debitRows, error: debitReadError } = await db
    .from("ledger_entries")
    .select("id")
    .eq("source_id", holdId)
    .eq("source_type", "manual_adjustment")
    .eq("description", sourceDesc)
    .eq("voided", false)
    .gt("debit_amount", 0);
  if (debitReadError || (debitRows ?? []).length === 0) {
    return {
      ok: false,
      error: "The hold charge on the ledger could not be found, so nothing was moved.",
    };
  }

  const moved = await db
    .from("seat_holds")
    .update({ booking_id: destBookingId })
    .eq("id", holdId)
    .eq("status", "open")
    .select("id");
  if (moved.error || (moved.data ?? []).length === 0) {
    return { ok: false, error: "Could not move the seat hold. Try again." };
  }

  const relabeled = await db
    .from("ledger_entries")
    .update({ description: destDesc })
    .eq("source_id", holdId)
    .eq("source_type", "manual_adjustment")
    .eq("description", sourceDesc)
    .eq("voided", false)
    .gt("debit_amount", 0)
    .select("id");
  if (relabeled.error || (relabeled.data ?? []).length === 0) {
    await db
      .from("seat_holds")
      .update({ booking_id: sourceBookingId })
      .eq("id", holdId)
      .eq("status", "open");
    return {
      ok: false,
      error: "Could not retarget the hold charge. Nothing was moved.",
    };
  }

  const { data: shares, error: shareError } = await db
    .from("booking_shares")
    .select("id")
    .eq("booking_id", destBookingId)
    .eq("player_id", playerId)
    .limit(1);
  if (shareError) {
    await revertHoldMove(db, holdId, sourceBookingId, sourceDesc, destDesc);
    return { ok: false, error: "Could not check the destination share. Nothing was moved." };
  }

  const applied = (shares ?? []).length > 0;
  if (applied) {
    const amount = round2(Number(hold.amount));
    const credit = await db
      .from("ledger_entries")
      .insert({
        entry_date: phTodayYmd(),
        player_id: hold.player_group_id ? null : playerId,
        player_group_id: hold.player_group_id,
        source_type: "manual_adjustment",
        source_id: holdId,
        description: `Seat hold applied ${destCode}`,
        debit_amount: 0,
        credit_amount: amount,
      })
      .select("id")
      .single();
    if (credit.error || !credit.data?.id) {
      await revertHoldMove(db, holdId, sourceBookingId, sourceDesc, destDesc);
      return {
        ok: false,
        error: "Could not apply the hold to the share. Nothing was moved.",
      };
    }
    const marked = await db
      .from("seat_holds")
      .update({ status: "applied" })
      .eq("id", holdId)
      .eq("status", "open")
      .select("id");
    if (marked.error || (marked.data ?? []).length === 0) {
      await db.from("ledger_entries").delete().eq("id", credit.data.id);
      await revertHoldMove(db, holdId, sourceBookingId, sourceDesc, destDesc);
      return {
        ok: false,
        error: "Could not apply the hold to the share. Nothing was moved.",
      };
    }
  }

  const { data: attendance } = await db
    .from("booking_attendance")
    .select("response_status")
    .eq("booking_id", sourceBookingId)
    .eq("player_id", playerId)
    .maybeSingle();
  let clearedFrom: string | null = null;
  let rsvpWarning: string | null = null;
  const previous = attendance?.response_status as string | undefined;
  if (previous && isSeatStatus(previous)) {
    const cleared = await db
      .from("booking_attendance")
      .update({ response_status: "no_response", hold_waived: false })
      .eq("booking_id", sourceBookingId)
      .eq("player_id", playerId)
      .eq("response_status", previous);
    if (cleared.error) {
      rsvpWarning =
        "The hold moved, but their Going or waitlist spot on the original game could not be cleared.";
    } else {
      clearedFrom = previous;
    }
  }

  const { data: player } = await db
    .from("players")
    .select("name")
    .eq("id", playerId)
    .maybeSingle();

  return {
    ok: true,
    move: {
      playerId,
      playerName: (player?.name as string | undefined)?.trim() || "Player",
      amount: round2(Number(hold.amount)),
      sourceBookingId,
      destBookingId,
      sourceCode,
      destCode,
      applied,
      clearedFrom,
      rsvpWarning,
    },
  };
}

async function revertHoldMove(
  db: Db,
  holdId: string,
  sourceBookingId: string,
  sourceDesc: string,
  destDesc: string,
) {
  await db
    .from("seat_holds")
    .update({ booking_id: sourceBookingId })
    .eq("id", holdId)
    .eq("status", "open");
  await db
    .from("ledger_entries")
    .update({ description: sourceDesc })
    .eq("source_id", holdId)
    .eq("description", destDesc)
    .eq("voided", false)
    .gt("debit_amount", 0);
}

export function holdFeeFromRow(row: { hold_fee?: number | null }): number | null {
  if (row.hold_fee == null || row.hold_fee === ("" as unknown)) return null;
  const fee = Number(row.hold_fee);
  return Number.isFinite(fee) ? fee : null;
}
