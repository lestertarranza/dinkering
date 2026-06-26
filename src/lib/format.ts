const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number as Philippine pesos, e.g. ₱1,250.00 */
export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  return peso.format(Number.isFinite(n as number) ? (n as number) : 0);
}

/** Money formatted without the symbol (for compact tables) */
export function formatAmount(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n as number) ? (n as number) : 0);
}

/** e.g. "Jun 21, 2026 (Sunday)" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  const datePart = d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const weekday = d.toLocaleDateString("en-PH", { weekday: "long" });
  return `${datePart} (${weekday})`;
}

/** Calendar-chip parts for a date, e.g. { weekday: "SUN", day: "21", month: "JUN" } */
export function dateChipParts(value: string | null | undefined): {
  weekday: string;
  day: string;
  month: string;
} | null {
  if (!value) return null;
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    weekday: d.toLocaleDateString("en-PH", { weekday: "short" }).toUpperCase(),
    day: d.toLocaleDateString("en-PH", { day: "2-digit" }),
    month: d.toLocaleDateString("en-PH", { month: "short" }).toUpperCase(),
  };
}

/** Convert a 24h time string (HH:MM[:SS]) to "7:00 PM" */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const [h, m] = value.split(":");
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return value;
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m ?? "00"} ${period}`;
}

export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "";
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  return formatTime(start || end);
}

/**
 * Sub-peso residue tolerance. Splitting fractional court/expense shares and
 * rounding each row to centavos can leave a few centavos of noise in a net
 * balance (e.g. ₱0.01). Anything within this tolerance of zero is treated as
 * settled so stray centavos never show up as a balance or amount due.
 */
export const SETTLE_TOLERANCE = 0.5;

/** True when an amount is effectively zero (within rounding tolerance). */
export function isSettled(amount: number): boolean {
  return Math.abs(amount) < SETTLE_TOLERANCE;
}

/**
 * Describe a wallet balance from the player's perspective.
 *  > 0  → owes money (collect)
 *  < 0  → has credit
 *  ≈ 0  → settled (within rounding tolerance)
 */
export function describeBalance(balance: number): {
  label: string;
  tone: "collect" | "credit" | "settled";
  amount: number;
} {
  if (balance >= SETTLE_TOLERANCE)
    return { label: "Owes", tone: "collect", amount: balance };
  if (balance <= -SETTLE_TOLERANCE)
    return { label: "Credit", tone: "credit", amount: Math.abs(balance) };
  return { label: "Settled", tone: "settled", amount: 0 };
}
