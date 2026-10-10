import { formatMoney, SETTLE_TOLERANCE } from "@/lib/format";
import { round2 } from "@/lib/ledger";
import { availableCredit } from "@/lib/seat-hold";

/**
 * Why a personal-wallet credit transfer cannot run.
 * Credit stays on each player's own ledger. Group wallets are not involved.
 */
export function personalCreditTransferProblem(opts: {
  sourcePlayerId: string;
  targetPlayerId: string;
  amount: number;
  sourceBalance: number;
}): string | null {
  if (!opts.sourcePlayerId || !opts.targetPlayerId) {
    return "Select both players.";
  }
  if (opts.sourcePlayerId === opts.targetPlayerId) {
    return "Choose a different player to receive the credit.";
  }
  const amount = round2(opts.amount);
  if (!Number.isFinite(amount) || amount < SETTLE_TOLERANCE) {
    return `Enter an amount of at least ${formatMoney(SETTLE_TOLERANCE)}.`;
  }
  const credit = availableCredit(opts.sourceBalance);
  if (credit + 0.001 < amount) {
    return `This personal wallet only has ${formatMoney(credit)} in credit.`;
  }
  return null;
}
