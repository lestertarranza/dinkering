import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatBookingContext } from "@/lib/booking-context";
import {
  validatePublicTeamToken,
} from "@/lib/public-links";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PublicSchedule({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();
  if (!(await validatePublicTeamToken(db, token))) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const { data: bookings } = await db
    .from("bookings")
    .select("*")
    .eq("status", "booked")
    .gte("play_date", today)
    .order("play_date")
    .order("start_time", { nullsFirst: false });

  const upcoming = (bookings ?? []) as Booking[];

  // RSVP counts per booking.
  const bookingIds = upcoming.map((b) => b.id);
  const { data: attendance } = bookingIds.length
    ? await db
        .from("booking_attendance")
        .select("booking_id, response_status")
        .in("booking_id", bookingIds)
    : { data: [] };

  const stats = new Map<
    string,
    { invited: number; going: number; maybe: number; notGoing: number }
  >();
  for (const a of attendance ?? []) {
    const bid = a.booking_id as string;
    const s = stats.get(bid) ?? {
      invited: 0,
      going: 0,
      maybe: 0,
      notGoing: 0,
    };
    s.invited += 1;
    if (a.response_status === "going") s.going += 1;
    else if (a.response_status === "maybe") s.maybe += 1;
    else if (a.response_status === "not_going") s.notGoing += 1;
    stats.set(bid, s);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-5 text-center">
        <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl">
          🏓
        </div>
        <h1 className="text-xl font-semibold text-slate-900">
          Upcoming games
        </h1>
        <p className="text-sm text-slate-500">
          Tap a game to see who&apos;s invited and RSVP status.
        </p>
      </header>

      <nav className="mb-4 flex justify-center gap-3 text-xs">
        <Link
          href={`/board/${token}`}
          className="text-emerald-600 hover:underline"
        >
          Team balances →
        </Link>
      </nav>

      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming games scheduled" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {upcoming.map((b) => {
            const st = stats.get(b.id);
            const ctx = formatBookingContext(b);
            return (
              <Link
                key={b.id}
                href={`/schedule/${token}/${b.id}`}
                className="block px-4 py-3 transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {b.booking_code ?? "Booking"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {formatDate(b.play_date)}
                    </p>
                    {ctx ? (
                      <p className="mt-0.5 text-xs text-slate-400">{ctx}</p>
                    ) : null}
                    {st && st.invited > 0 ? (
                      <p className="mt-1 text-xs text-slate-400">
                        {st.going} going
                        {st.maybe > 0 ? ` · ${st.maybe} maybe` : ""}
                        {st.notGoing > 0 ? ` · ${st.notGoing} not going` : ""}
                        {st.invited - st.going - st.maybe - st.notGoing > 0
                          ? ` · ${
                              st.invited - st.going - st.maybe - st.notGoing
                            } no response`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        No players invited yet
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-slate-300">›</span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}

      <footer className="mt-6 text-center text-xs text-slate-300">
        Shared schedule · please don&apos;t post publicly
      </footer>
    </main>
  );
}
