import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTimeRange } from "./format";
import type { LedgerEntry } from "./types";

export interface BookingContext {
  play_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  court_number: string | null;
}

/**
 * Human-readable "time · venue · court" suffix for a booking, skipping any
 * parts that are missing. Returns "" when there is nothing to show.
 */
export function formatBookingContext(
  ctx: BookingContext | undefined | null,
): string {
  if (!ctx) return "";
  const parts: string[] = [];
  const time = formatTimeRange(ctx.start_time, ctx.end_time);
  if (time) parts.push(time);
  if (ctx.venue) parts.push(ctx.venue);
  if (ctx.court_number) parts.push(ctx.court_number);
  return parts.join(" · ");
}

const BOOKING_FIELDS =
  "play_date, start_time, end_time, venue, court_number" as const;

/**
 * For a set of ledger entries, resolve the originating booking's schedule/venue
 * details (for booking_share and booking-tagged payment entries) and return a
 * map keyed by ledger entry id. Entries with no booking are simply omitted.
 */
export async function buildLedgerBookingContext(
  db: SupabaseClient,
  entries: LedgerEntry[],
): Promise<Map<string, BookingContext>> {
  const result = new Map<string, BookingContext>();

  const shareIds = entries
    .filter((e) => e.source_type === "booking_share" && e.source_id)
    .map((e) => e.source_id as string);
  const paymentIds = entries
    .filter((e) => e.source_type === "payment" && e.source_id)
    .map((e) => e.source_id as string);

  const [shareRows, paymentRows] = await Promise.all([
    shareIds.length
      ? db
          .from("booking_shares")
          .select(`id, bookings(${BOOKING_FIELDS})`)
          .in("id", shareIds)
      : Promise.resolve({ data: [] as unknown[] }),
    paymentIds.length
      ? db
          .from("payments")
          .select(`id, bookings(${BOOKING_FIELDS})`)
          .in("id", paymentIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const shareCtx = new Map<string, BookingContext>();
  for (const r of (shareRows.data ?? []) as {
    id: string;
    bookings: BookingContext | null;
  }[]) {
    if (r.bookings) shareCtx.set(r.id, r.bookings);
  }
  const payCtx = new Map<string, BookingContext>();
  for (const r of (paymentRows.data ?? []) as {
    id: string;
    bookings: BookingContext | null;
  }[]) {
    if (r.bookings) payCtx.set(r.id, r.bookings);
  }

  for (const e of entries) {
    if (!e.source_id) continue;
    const ctx =
      e.source_type === "booking_share"
        ? shareCtx.get(e.source_id)
        : e.source_type === "payment"
          ? payCtx.get(e.source_id)
          : undefined;
    if (ctx) result.set(e.id, ctx);
  }

  return result;
}
