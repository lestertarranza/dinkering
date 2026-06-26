import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  mergeCourts,
  overallCourtTimeRange,
  formatCourtTime,
} from "@/lib/court-format";
import { validatePublicTeamToken } from "@/lib/public-links";
import {
  PublicPageHeader,
  PublicNavLink,
  DateChip,
  CountPill,
  CapacityBar,
  publicMainClass,
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
  const [{ data: attendance }, { data: allCourts }] = await Promise.all([
    bookingIds.length
      ? db.from("booking_attendance").select("booking_id, response_status").in("booking_id", bookingIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? db.from("booking_courts").select("booking_id, court_number, start_time, end_time, hours, max_players").in("booking_id", bookingIds).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  type CourtRow = { booking_id: string; court_number: string | null; start_time: string | null; end_time: string | null; hours: number; max_players: number };
  const courtsByBooking = new Map<string, CourtRow[]>();
  for (const c of (allCourts ?? []) as CourtRow[]) {
    const list = courtsByBooking.get(c.booking_id) ?? [];
    list.push(c);
    courtsByBooking.set(c.booking_id, list);
  }

  const stats = new Map<
    string,
    { invited: number; going: number; maybe: number; notGoing: number; waitlisted: number }
  >();
  for (const a of attendance ?? []) {
    const bid = a.booking_id as string;
    const s = stats.get(bid) ?? { invited: 0, going: 0, maybe: 0, notGoing: 0, waitlisted: 0 };
    s.invited += 1;
    if (a.response_status === "going") s.going += 1;
    else if (a.response_status === "maybe") s.maybe += 1;
    else if (a.response_status === "not_going") s.notGoing += 1;
    else if (a.response_status === "waitlist") s.waitlisted += 1;
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
        <div className="space-y-4">
          {upcoming.map((b) => {
            const st = stats.get(b.id);
            const cts = courtsByBooking.get(b.id) ?? [];
            const overall = overallCourtTimeRange(cts);
            const merged = mergeCourts(cts);
            const totalMax = merged.every((m) => m.maxPlayers === 0)
              ? 0
              : merged.reduce((s, m) => s + m.maxPlayers, 0);
            const going = st?.going ?? 0;
            const noResponse = st
              ? st.invited - st.going - st.maybe - st.notGoing - st.waitlisted
              : 0;
            const urls =
              b.confirmation_urls && b.confirmation_urls.length > 0
                ? b.confirmation_urls
                : b.confirmation_url
                  ? [b.confirmation_url]
                  : [];
            return (
              // Wrap in a div so the confirmation link can sit OUTSIDE the
              // tappable <Link> — nested <a> inside <a> hijacks the click.
              <Card
                key={b.id}
                className="overflow-hidden transition-all duration-150 hover:border-emerald-300 hover:shadow-md"
              >
                <Link
                  href={`/schedule/${token}/${b.id}`}
                  className="block touch-manipulation p-4 transition-colors active:bg-emerald-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-500"
                >
                  <div className="flex items-start gap-4">
                    <DateChip value={b.play_date} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-lg ${publicPrimaryText}`}>
                          {b.booking_code ?? "Booking"}
                        </p>
                        <span className={publicChevronClass} aria-hidden>
                          ›
                        </span>
                      </div>
                      <p className={`mt-0.5 ${publicMetaText}`}>
                        {formatDate(b.play_date)}
                      </p>
                      {b.venue || overall ? (
                        <p className={`mt-1.5 ${publicHintText}`}>
                          {b.venue ? (
                            <span className="font-medium text-slate-700">
                              📍 {b.venue}
                            </span>
                          ) : null}
                          {b.venue && overall ? " · " : null}
                          {overall ? <span>🕐 {overall}</span> : null}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {merged.length > 0 ? (
                    <div className="mt-3 space-y-0.5 rounded-lg bg-slate-50 px-3 py-2">
                      {merged.map((m, i) => (
                        <p key={i} className="text-sm text-slate-700">
                          🏓 <span className="font-medium">{m.label}:</span>{" "}
                          {formatCourtTime(m) || "—"}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {b.notes ? (
                    <p className={`mt-2 whitespace-pre-wrap ${publicHintText}`}>
                      <span className="font-medium">Notes: </span>
                      {b.notes}
                    </p>
                  ) : null}

                  {st && st.invited > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <CountPill count={st.going} label="going" tone="going" />
                      {st.waitlisted > 0 ? (
                        <CountPill
                          count={st.waitlisted}
                          label="waitlisted"
                          tone="waitlist"
                        />
                      ) : null}
                      {st.maybe > 0 ? (
                        <CountPill count={st.maybe} label="maybe" tone="maybe" />
                      ) : null}
                      {st.notGoing > 0 ? (
                        <CountPill
                          count={st.notGoing}
                          label="not going"
                          tone="not_going"
                        />
                      ) : null}
                      {noResponse > 0 ? (
                        <CountPill
                          count={noResponse}
                          label="no response"
                          tone="neutral"
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p className={`mt-3 ${publicHintText}`}>
                      No players invited yet
                    </p>
                  )}

                  {totalMax > 0 ? (
                    <div className="mt-3">
                      <CapacityBar going={going} totalMax={totalMax} />
                    </div>
                  ) : null}
                </Link>

                {/* Confirmation links rendered OUTSIDE the tappable Link */}
                {urls.length > 0 ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5">
                    {urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-emerald-600 hover:underline"
                      >
                        📋{" "}
                        {urls.length > 1
                          ? `Confirmation ${i + 1}`
                          : "View booking confirmation"}{" "}
                        ↗
                      </a>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared schedule · please don&apos;t post publicly
      </footer>
    </main>
  );
}
