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

/** e.g. "Jun 21, 2026" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
 * Describe a wallet balance from the player's perspective.
 *  > 0  → owes money (collect)
 *  < 0  → has credit
 *  = 0  → settled
 */
export function describeBalance(balance: number): {
  label: string;
  tone: "collect" | "credit" | "settled";
  amount: number;
} {
  if (balance > 0.005)
    return { label: "Owes", tone: "collect", amount: balance };
  if (balance < -0.005)
    return { label: "Credit", tone: "credit", amount: Math.abs(balance) };
  return { label: "Settled", tone: "settled", amount: 0 };
}
