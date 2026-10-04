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
    return `${who} still has ${formatMoney(opts.balance)} to settle. Pay that first before Going or joining the waitlist. The minimum hold is ${formatMoney(MIN_HOLD_FEE)} per game.`;
  }
  const credit = availableCredit(opts.balance);
  if (credit + 0.001 < opts.holdFee) {
    const has = opts.sharedWallet
      ? `The shared wallet has ${formatMoney(credit)} court credit.`
      : `You have ${formatMoney(credit)} court credit.`;
    return `${has} This game needs ${formatMoney(opts.holdFee)} before you can tap Going or the waitlist.`;
  }
  return null;
}

export function seatHoldNote(holdFee: number): string {
  return `Going and the waitlist each take a seat hold of ${formatMoney(holdFee)} from court credit. After the game it is applied to your share. Leave more than 24 hours before the game and the hold comes back as credit.`;
}

/** One seat's share, used as the default late-cancel charge. */
export function defaultLateCancelCharge(
  courtTotal: number,
  seatCount: number,
): number {
  if (seatCount <= 0 || courtTotal <= 0) return 0;
  return round2(courtTotal / seatCount);
}
