import { formatMoney, SETTLE_TOLERANCE } from "@/lib/format";
import { round2 } from "@/lib/ledger";

/** Lowest seat hold a booking can use. */
export const MIN_HOLD_FEE = 200;

export function parseHoldFee(
  raw: unknown,
): { ok: true; fee: number } | { ok: false; error: string } {
  const text = String(raw ?? "").trim();
  if (!text) {
    return { ok: false, error: "Enter a hold fee of at least ₱200." };
  }
  const fee = round2(Number(text));
  if (!Number.isFinite(fee)) {
    return { ok: false, error: "Enter a hold fee of at least ₱200." };
  }
  if (fee < MIN_HOLD_FEE) {
    return {
      ok: false,
      error: `Hold fee must be at least ${formatMoney(MIN_HOLD_FEE)} per player.`,
    };
  }
  return { ok: true, fee };
}

export function owesBalance(balance: number): boolean {
  return balance >= SETTLE_TOLERANCE;
}

/** Court credit available to take a seat. Owed and settled wallets have none. */
export function availableCredit(balance: number): number {
  if (balance <= -SETTLE_TOLERANCE) return round2(Math.abs(balance));
  return 0;
}

export function isSeatStatus(status: string | null | undefined): boolean {
  return status === "going" || status === "waitlist";
}

/**
 * Why this wallet cannot take a Going or waitlist seat.
 * A seat that already has an open hold does not need a second one.
 */
export function seatHoldBlockReason(opts: {
  balance: number;
  holdFee: number;
  alreadyHeld: boolean;
  sharedWallet: boolean;
}): string | null {
  if (opts.alreadyHeld) return null;
  const who = opts.sharedWallet ? "The shared wallet" : "Your wallet";
  if (owesBalance(opts.balance)) {
    return `${who} still has ${formatMoney(opts.balance)} to settle. Pay that first, then you can tap Going or Waitlist. Each game needs at least ${formatMoney(MIN_HOLD_FEE)} in credit.`;
  }
  const credit = availableCredit(opts.balance);
  if (credit + 0.001 < opts.holdFee) {
    const has = opts.sharedWallet
      ? `The shared wallet has ${formatMoney(credit)} in credit.`
      : `You have ${formatMoney(credit)} in credit.`;
    return `${has} This game sets aside ${formatMoney(opts.holdFee)} when you tap Going or Waitlist.`;
  }
  return null;
}

export function seatHoldNote(holdFee: number): string {
  return `Tapping Going or Waitlist sets aside ${formatMoney(holdFee)} from your credit. After the game, that amount goes toward your share. Switch to Not going more than 24 hours before the game and it comes back.`;
}

/** One seat's share, used as the default late-cancel charge. */
export function defaultLateCancelCharge(
  courtTotal: number,
  seatCount: number,
): number {
  if (seatCount <= 0 || courtTotal <= 0) return 0;
  return round2(courtTotal / seatCount);
}
