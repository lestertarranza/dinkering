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
  const slotsLeft = totalMax > 0 ? Math.max(0, totalMax - going) : null;
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
      <header className="mb-5">
        <Link href={`/schedule/${token}`} className={publicBackLinkClass}>
          ← All upcoming games
        </Link>
        <div className="mt-4 text-center">
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-2xl shadow-sm">
            🏓
          </div>
          <h1 className={`text-2xl ${publicPrimaryText}`}>
            {b.booking_code ?? "Booking"}
          </h1>
          <p className="mt-1 text-base font-medium text-slate-700">
            {formatDate(b.play_date)}
          </p>
          {venueLine ? (
            <p className={`mt-1.5 ${publicHintText}`}>{venueLine}</p>
          ) : null}
          {/* Courts (merged by court number — no max here) */}
          {mergedCourts.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {mergedCourts.map((m, i) => (
                <p key={i} className={publicHintText}>
                  {m.label}: {formatCourtTime(m) || "—"}
                </p>
              ))}
            </div>
          ) : null}
          {b.notes ? (
            <p className={`mt-2 whitespace-pre-wrap ${publicHintText}`}>
              <span className="font-medium">Notes: </span>{b.notes}
            </p>
          ) : null}
          {confirmationUrls.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {confirmationUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-emerald-700 hover:underline"
                >
                  📋 {confirmationUrls.length > 1 ? `Confirmation ${i + 1}` : "View booking confirmation"} ↗
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {roster.length > 0 ? (
        <p className="mb-3 px-1 text-center text-sm font-semibold text-slate-700">
          <span className="text-emerald-700">{going} going</span>
          {waitlisted > 0 ? <>{" · "}<span className="text-amber-600">{waitlisted} waitlisted</span></> : null}
          {" · "}
          <span className="text-amber-700">{maybe} maybe</span>
          {" · "}
          <span className="text-rose-700">{notGoing} not going</span>
          {noResponse > 0 ? (
            <>
              {" · "}
              <span className="text-slate-600">{noResponse} no response</span>
            </>
          ) : null}
        </p>
      ) : null}

      {/* Total capacity + slots remaining (below RSVP details) */}
      {totalMax > 0 ? (
        <p className={`mb-3 px-1 text-center text-sm font-semibold ${slotsLeft === 0 ? "text-rose-600" : "text-emerald-700"}`}>
          {totalMax} max ·{" "}
          {slotsLeft === 0
            ? "Full — join waitlist"
            : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} remaining`}
        </p>
      ) : null}

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
