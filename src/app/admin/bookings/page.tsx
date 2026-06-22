import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, StatusBadge, Badge, EmptyState } from "@/components/ui";
import {
  formatMoney,
  formatDate,
  formatTimeRange,
  SETTLE_TOLERANCE,
} from "@/lib/format";
import { round2 } from "@/lib/ledger";
import type { Booking } from "@/lib/types";
import { BookingForm } from "./BookingForm";
import { createBooking } from "./actions";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: bookings }, { data: paidTotals }, { data: shareTotals }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .order("play_date", { ascending: false }),
      supabase.from("booking_payment_totals").select("*"),
      supabase.from("booking_share_totals").select("*"),
    ]);

  const paidMap = new Map(
    (paidTotals ?? []).map((b) => [b.booking_id as string, Number(b.total_paid)]),
  );
  const shareMap = new Map(
    (shareTotals ?? []).map((b) => [
      b.booking_id as string,
      Number(b.total_shared),
    ]),
  );

  const all = (bookings ?? []) as Booking[];
  const upcoming = all
    .filter((b) => b.play_date >= today && b.status === "booked")
    .sort((a, b) => a.play_date.localeCompare(b.play_date));
  const past = all.filter((b) => !(b.play_date >= today && b.status === "booked"));

  function Row({ b }: { b: Booking }) {
    const paid = paidMap.get(b.id) ?? 0;
    const shareTotal = shareMap.get(b.id) ?? 0;
    const hasShares = shareTotal >= SETTLE_TOLERANCE;
    // Collectible = charged shares − payments (ledger basis), so it matches the
    // booking detail and player balances rather than the raw court cost.
    const outstanding = round2(shareTotal - paid);
    // Only "booked" and "played" bookings are collectible. Cancelled and
    // refunded bookings carry no due (e.g. the slot was sold/handed off).
    const billable = b.status === "booked" || b.status === "played";
    return (
      <Link
        href={`/admin/bookings/${b.id}`}
        className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-slate-900">
              {b.booking_code ?? "Booking"}
              <StatusBadge status={b.status} />
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDate(b.play_date)}
              {b.start_time
                ? ` · ${formatTimeRange(b.start_time, b.end_time)}`
                : ""}
              {b.venue ? ` · ${b.venue}` : ""}
              {b.court_number ? ` · ${b.court_number}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900">
              {formatMoney(b.total_booking_cost)}
            </p>
            {billable && hasShares ? (
              outstanding >= SETTLE_TOLERANCE ? (
                <span className="mt-1 inline-block">
                  <Badge tone="collect">
                    {formatMoney(outstanding)} due
                  </Badge>
                </span>
              ) : (
                <span className="mt-1 inline-block">
                  <Badge tone="paid">Paid</Badge>
                </span>
              )
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Court reservations, costs, attendance, and shares."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:order-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Add booking
          </h2>
          <BookingForm action={createBooking} submitLabel="Create booking" />
        </Card>

        <div className="space-y-6 lg:order-1 lg:col-span-2">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState title="No upcoming bookings" />
            ) : (
              <div className="space-y-2">
                {upcoming.map((b) => (
                  <Row key={b.id} b={b} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Past & other ({past.length})
            </h2>
            {past.length === 0 ? (
              <EmptyState title="No past bookings yet" />
            ) : (
              <div className="space-y-2">
                {past.map((b) => (
                  <Row key={b.id} b={b} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
