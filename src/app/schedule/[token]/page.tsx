import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatBookingContext } from "@/lib/booking-context";
import { validatePublicTeamToken } from "@/lib/public-links";
import {
  PublicPageHeader,
  PublicNavLink,
  publicMainClass,
  publicTapBlockClass,
  publicChevronClass,
  publicPrimaryText,
  publicMetaText,
  publicHintText,
} from "@/components/public-ui";
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
    .in("status", ["for_booking", "booked"])
    .gte("play_date", today)
    .order("play_date")
    .order("start_time", { nullsFirst: false });

  const upcoming = (bookings ?? []) as Booking[];

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
    <main className={publicMainClass}>
      <PublicPageHeader
        icon="🏓"
        title="Upcoming games"
        subtitle="Tap a game to see who's invited and RSVP status."
      />

      <nav className="mb-5 flex justify-center">
        <PublicNavLink href={`/board/${token}`}>Team balances</PublicNavLink>
      </nav>

      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming games scheduled" />
      ) : (
        <Card className="overflow-hidden">
          {upcoming.map((b) => {
            const st = stats.get(b.id);
            const ctx = formatBookingContext(b);
            return (
              // Wrap in a div so the confirmation link can sit OUTSIDE the
              // tappable <Link> — nested <a> inside <a> hijacks the click.
              <div key={b.id} className="border-b border-slate-100 last:border-0">
                <Link
                  href={`/schedule/${token}/${b.id}`}
                  className={publicTapBlockClass}
                >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-lg ${publicPrimaryText}`}>
                      {b.booking_code ?? "Booking"}
                    </p>
                    <p className={`mt-0.5 ${publicMetaText}`}>
                      {formatDate(b.play_date)}
                    </p>
                    {ctx ? (
                      <p className={`mt-1 ${publicHintText}`}>{ctx}</p>
                    ) : null}
                    {b.notes ? (
                      <p className={`mt-1 whitespace-pre-wrap ${publicHintText}`}>
                        <span className="font-medium">Notes: </span>{b.notes}
                      </p>
                    ) : null}
                    {st && st.invited > 0 ? (
                      <p className="mt-2 text-sm font-medium text-emerald-800">
                        <span className="text-emerald-700">{st.going} going</span>
                        {st.maybe > 0 ? (
                          <span className="text-amber-700">
                            {" "}
                            · {st.maybe} maybe
                          </span>
                        ) : null}
                        {st.notGoing > 0 ? (
                          <span className="text-rose-700">
                            {" "}
                            · {st.notGoing} not going
                          </span>
                        ) : null}
                        {st.invited - st.going - st.maybe - st.notGoing > 0 ? (
                          <span className="text-slate-600">
                            {" "}
                            ·{" "}
                            {st.invited - st.going - st.maybe - st.notGoing}{" "}
                            no response
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className={`mt-1 ${publicHintText}`}>
                        No players invited yet
                      </p>
                    )}
                  </div>
                  <span className={publicChevronClass} aria-hidden>
                    ›
                  </span>
                </div>
                </Link>
                {/* Confirmation link rendered OUTSIDE the tappable Link */}
                {b.confirmation_url ? (
                  <div className="px-4 pb-3">
                    <a
                      href={b.confirmation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-emerald-600 hover:underline"
                    >
                      📋 View booking confirmation ↗
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Card>
      )}

      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared schedule · please don&apos;t post publicly
      </footer>
    </main>
  );
}
