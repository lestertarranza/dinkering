import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, StatusBadge, EmptyState } from "@/components/ui";
import { formatDate, formatTimeRange } from "@/lib/format";
import {
  publicPlayerLabel,
  validatePublicTeamToken,
} from "@/lib/public-links";
import type { Booking, BookingAttendance, Player } from "@/lib/types";

export const dynamic = "force-dynamic";

const RSVP_ORDER: Record<string, number> = {
  going: 0,
  maybe: 1,
  no_response: 2,
  not_going: 3,
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

  const { data: attendance } = await db
    .from("booking_attendance")
    .select(
      "*, players(id, name, display_name, public_token, active_status)",
    )
    .eq("booking_id", bookingId);

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
  const noResponse = roster.length - going - maybe - notGoing;

  const ctx = [
    formatTimeRange(b.start_time, b.end_time),
    b.venue,
    b.court_number,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <header className="mb-5">
        <Link
          href={`/schedule/${token}`}
          className="mb-3 inline-block text-sm text-emerald-600 hover:underline"
        >
          ← All upcoming games
        </Link>
        <div className="text-center">
          <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl">
            🏓
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {b.booking_code ?? "Booking"}
          </h1>
          <p className="text-sm text-slate-600">{formatDate(b.play_date)}</p>
          {ctx ? (
            <p className="mt-1 text-xs text-slate-400">{ctx}</p>
          ) : null}
        </div>
      </header>

      {roster.length > 0 ? (
        <p className="mb-3 px-1 text-center text-xs text-slate-500">
          {going} going · {maybe} maybe · {notGoing} not going
          {noResponse > 0 ? ` · ${noResponse} no response` : ""}
        </p>
      ) : null}

      {roster.length === 0 ? (
        <EmptyState title="No players invited yet" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {roster.map((r) => (
            <Link
              key={r.id}
              href={`/p/${r.players.public_token}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {publicPlayerLabel(r.players)}
                </p>
                <p className="text-xs text-slate-400">
                  Tap to open your page &amp; RSVP
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.response_status} />
                <span className="text-slate-300">›</span>
              </div>
            </Link>
          ))}
        </Card>
      )}

      <p className="mt-4 px-1 text-center text-xs text-slate-400">
        Tap your name to open your private page and confirm Going / Maybe /
        Not going.
      </p>

      <nav className="mt-4 flex justify-center gap-3 text-xs">
        <Link
          href={`/board/${token}`}
          className="text-emerald-600 hover:underline"
        >
          Team balances
        </Link>
        <span className="text-slate-300">·</span>
        <Link
          href={`/schedule/${token}`}
          className="text-emerald-600 hover:underline"
        >
          All upcoming games
        </Link>
      </nav>

      <footer className="mt-6 text-center text-xs text-slate-300">
        Shared schedule · please don&apos;t post publicly
      </footer>
    </main>
  );
}
