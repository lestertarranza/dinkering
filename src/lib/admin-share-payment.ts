import { isSettled } from "@/lib/format";
import { round2 } from "@/lib/ledger";

/**
 * One open court or club-item charge for a club admin, on the wallet that
 * actually received the debit.
 */
export type AdminChargeSlice = {
  playerId: string;
  walletPlayerId: string | null;
  walletGroupId: string | null;
  remaining: number;
};

export type AdminPaymentPlan = {
  playerId: string;
  walletPlayerId: string | null;
  walletGroupId: string | null;
  amount: number;
};

/**
 * One payment per admin per wallet. Court and club-item remainders on the
 * same wallet are added together. Amounts inside the settle tolerance are
 * left alone so a second run does not record another payment.
 */
export function planAdminSharePayments(
  charges: AdminChargeSlice[],
): AdminPaymentPlan[] {
  const grouped = new Map<string, AdminPaymentPlan>();
  for (const charge of charges) {
    if (!charge.playerId || !(charge.remaining > 0)) continue;
    if (!charge.walletPlayerId && !charge.walletGroupId) continue;
    const key = `${charge.playerId}|${charge.walletGroupId ?? ""}|${charge.walletPlayerId ?? ""}`;
    const current = grouped.get(key) ?? {
      playerId: charge.playerId,
      walletPlayerId: charge.walletPlayerId,
      walletGroupId: charge.walletGroupId,
      amount: 0,
    };
    current.amount = round2(current.amount + charge.remaining);
    grouped.set(key, current);
  }
  return [...grouped.values()].filter((row) => !isSettled(row.amount));
}

/** Short suffix for the share-generation success message. */
export function adminSharePaymentNote(result: {
  ok: boolean;
  error?: string;
  payments: unknown[];
}): string {
  if (!result.ok) {
    return ` Club admin payments were not recorded${
      result.error ? `: ${result.error}` : ""
    }.`;
  }
  if (result.payments.length === 0) return "";
  return " Club admin shares were marked paid.";
}
