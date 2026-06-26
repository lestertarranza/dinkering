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
        <Card className="overflow-hidden">
          {upcoming.map((b) => {
            const st = stats.get(b.id);
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
                    {/* Venue + overall time, derived from current courts */}
                    {(() => {
                      const cts = courtsByBooking.get(b.id) ?? [];
                      const overall = overallCourtTimeRange(cts);
                      const parts = [
                        b.venue ? `Venue: ${b.venue}` : null,
                        overall || null,
                      ].filter(Boolean);
                      if (parts.length === 0) return null;
                      return (
                        <p className={`mt-1 ${publicHintText}`}>{parts.join(" · ")}</p>
                      );
                    })()}
                    {/* Per-court timings + capacity (merged by court number) */}
                    {(() => {
                      const cts = courtsByBooking.get(b.id) ?? [];
                      if (cts.length === 0) return null;
                      const merged = mergeCourts(cts);
                      const totalMax = merged.every((m) => m.maxPlayers === 0)
                        ? 0
                        : merged.reduce((s, m) => s + m.maxPlayers, 0);
                      const going = stats.get(b.id)?.going ?? 0;
                      const slotsLeft = totalMax > 0 ? Math.max(0, totalMax - going) : null;
                      return (
                        <div className={`mt-1.5 space-y-0.5`}>
                          {merged.map((m, i) => (
                            <p key={i} className={publicHintText}>
                              {m.label}: {formatCourtTime(m) || "—"}
                              {m.maxPlayers > 0 ? ` · ${m.maxPlayers} max` : ""}
                            </p>
                          ))}
                          {totalMax > 0 ? (
                            <p className={`text-xs font-medium ${slotsLeft === 0 ? "text-rose-600" : "text-emerald-700"}`}>
                              {slotsLeft === 0
                                ? "Full — join waitlist"
                                : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} remaining`}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                    {b.notes ? (
                      <p className={`mt-1 whitespace-pre-wrap ${publicHintText}`}>
                        <span className="font-medium">Notes: </span>{b.notes}
                      </p>
                    ) : null}
                    {st && st.invited > 0 ? (
                      <p className="mt-2 text-sm font-medium text-emerald-800">
                        <span className="text-emerald-700">{st.going} going</span>
                        {st.waitlisted > 0 ? <span className="text-amber-700"> · {st.waitlisted} waitlisted</span> : null}
                        {st.maybe > 0 ? <span className="text-amber-700"> · {st.maybe} maybe</span> : null}
                        {st.notGoing > 0 ? <span className="text-rose-700"> · {st.notGoing} not going</span> : null}
                        {st.invited - st.going - st.maybe - st.notGoing - st.waitlisted > 0 ? (
                          <span className="text-slate-600"> · {st.invited - st.going - st.maybe - st.notGoing - st.waitlisted} no response</span>
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
                {/* Confirmation links rendered OUTSIDE the tappable Link */}
                {(() => {
                  const urls =
                    b.confirmation_urls && b.confirmation_urls.length > 0
                      ? b.confirmation_urls
                      : b.confirmation_url
                        ? [b.confirmation_url]
                        : [];
                  if (urls.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3">
                      {urls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-emerald-600 hover:underline"
                        >
                          📋 {urls.length > 1 ? `Confirmation ${i + 1}` : "View booking confirmation"} ↗
                        </a>
                      ))}
                    </div>
                  );
                })()}
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
