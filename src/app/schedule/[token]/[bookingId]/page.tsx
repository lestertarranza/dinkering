import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  mergeCourts,
  overallCourtTimeRange,
  formatCourtTime,
} from "@/lib/court-format";
import {
  publicPlayerLabel,
  validatePublicTeamToken,
} from "@/lib/public-links";
import {
  PublicNavLink,
  DateChip,
  CountPill,
  CapacityBar,
  publicMainClass,
  publicTapRowClass,
  publicChevronClass,
  publicBackLinkClass,
  publicPrimaryText,
  publicHintText,
} from "@/components/public-ui";
import type { Booking, BookingAttendance, Player } from "@/lib/types";

export const dynamic = "force-dynamic";

// Responded players (going / maybe / waitlist / not going) first, no-response last.
const RSVP_ORDER: Record<string, number> = {
  going: 0,
  maybe: 1,
  waitlist: 2,
  not_going: 3,
  no_response: 4,
};

export default async function PublicBookingRoster({
  params,
}: {
  params: Promise<{ token: string; bookingId: string }>;
}) {
  const { token, bookingId } = await params;
  const db = createAdminClient();
  if (!(await validatePublicTeamToken(db, token))) notFound();

  const { data: booking } = await db
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) notFound();
  const b = booking as Booking;

  const [{ data: attendance }, { data: courtsData }] = await Promise.all([
    db.from("booking_attendance").select("*, players(id, name, display_name, public_token, active_status)").eq("booking_id", bookingId),
    db.from("booking_courts").select("court_number, start_time, end_time, hours, max_players").eq("booking_id", bookingId).order("created_at"),
  ]);

  type Row = BookingAttendance & {
    players: Pick<
      Player,
      "id" | "name" | "display_name" | "public_token" | "active_status"
    >;
  };

  const roster = ((attendance ?? []) as unknown as Row[]).sort((a, b) => {
    const ra = RSVP_ORDER[a.response_status] ?? 9;
    const rb = RSVP_ORDER[b.response_status] ?? 9;
    if (ra !== rb) return ra - rb;
    return publicPlayerLabel(a.players).localeCompare(
      publicPlayerLabel(b.players),
    );
  });

  const going = roster.filter((r) => r.response_status === "going").length;
  const maybe = roster.filter((r) => r.response_status === "maybe").length;
  const notGoing = roster.filter((r) => r.response_status === "not_going").length;
  const waitlisted = roster.filter((r) => r.response_status === "waitlist").length;
  const noResponse = roster.length - going - maybe - notGoing - waitlisted;

  type CourtInfo = { court_number: string | null; start_time: string | null; end_time: string | null; hours: number; max_players: number };
  const courts = (courtsData ?? []) as CourtInfo[];
  const mergedCourts = mergeCourts(courts);
  const totalMax = mergedCourts.length > 0 && mergedCourts.every((m) => m.maxPlayers > 0)
    ? mergedCourts.reduce((s, m) => s + m.maxPlayers, 0) : 0;
  const overallTime = overallCourtTimeRange(courts);
  const venueLine = [
    b.venue ? `Venue: ${b.venue}` : null,
    overallTime || null,
  ].filter(Boolean).join(" · ");
  const confirmationUrls =
    b.confirmation_urls && b.confirmation_urls.length > 0
      ? b.confirmation_urls
      : b.confirmation_url
        ? [b.confirmation_url]
        : [];

  return (
    <main className={publicMainClass}>
      <Link
        href={`/schedule/${token}`}
        className={`mb-4 ${publicBackLinkClass}`}
      >
        ← All upcoming games
      </Link>

      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-start gap-4">
            <DateChip value={b.play_date} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className={`text-xl ${publicPrimaryText}`}>
                  {b.booking_code ?? "Booking"}
                </h1>
                <StatusBadge status={b.status} size="sm" />
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-700">
                {formatDate(b.play_date)}
              </p>
              {venueLine ? (
                <p className={`mt-1.5 ${publicHintText}`}>
                  {b.venue ? (
                    <span className="font-medium text-slate-700">
                      📍 {b.venue}
                    </span>
                  ) : null}
                  {b.venue && overallTime ? " · " : null}
                  {overallTime ? <span>🕐 {overallTime}</span> : null}
                </p>
              ) : null}
            </div>
          </div>

          {mergedCourts.length > 0 ? (
            <div className="mt-3 space-y-0.5 rounded-lg bg-slate-50 px-3 py-2">
              {mergedCourts.map((m, i) => (
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

          {confirmationUrls.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {confirmationUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  📋{" "}
                  {confirmationUrls.length > 1
                    ? `Confirmation ${i + 1}`
                    : "View booking confirmation"}{" "}
                  ↗
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {(roster.length > 0 || totalMax > 0) ? (
          <div className="space-y-3 bg-slate-50/60 p-4">
            {roster.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <CountPill count={going} label="going" tone="going" />
                {waitlisted > 0 ? (
                  <CountPill
                    count={waitlisted}
                    label="waitlisted"
                    tone="waitlist"
                  />
                ) : null}
                <CountPill count={maybe} label="maybe" tone="maybe" />
                <CountPill count={notGoing} label="not going" tone="not_going" />
                {noResponse > 0 ? (
                  <CountPill
                    count={noResponse}
                    label="no response"
                    tone="neutral"
                  />
                ) : null}
              </div>
            ) : null}
            {totalMax > 0 ? (
              <CapacityBar going={going} totalMax={totalMax} />
            ) : null}
          </div>
        ) : null}
      </Card>

      {roster.length === 0 ? (
        <EmptyState title="No players invited yet" />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {roster.map((r) => (
            <Link
              key={r.id}
              href={`/p/${r.players.public_token}#booking-${bookingId}`}
              className={publicTapRowClass}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-base ${publicPrimaryText}`}>
                  {publicPlayerLabel(r.players)}
                </p>
                <p className={publicHintText}>Tap to RSVP on your page</p>
              </div>
              <StatusBadge status={r.response_status} size="md" />
              <span className={publicChevronClass} aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </Card>
      )}

      <p className={`mt-4 px-1 text-center ${publicHintText}`}>
        Tap your name to open your private page and confirm Going / Maybe / Not
        going.
      </p>

      <nav className="mt-5 flex flex-wrap justify-center gap-2">
        <PublicNavLink href={`/board/${token}`}>Team balances</PublicNavLink>
        <PublicNavLink href={`/schedule/${token}`}>All games</PublicNavLink>
      </nav>

      <footer className="mt-6 text-center text-sm text-slate-400">
        Shared schedule · please don&apos;t post publicly
      </footer>
    </main>
  );
}
