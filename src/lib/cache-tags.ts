import { revalidateTag } from "next/cache";

/** Club-item In pot snapshot used by Balances / dashboard. */
export const CLUB_FUND_CASH_TAG = "club-fund-cash";

export function revalidateClubFundCash() {
  revalidateTag(CLUB_FUND_CASH_TAG, "max");
}
