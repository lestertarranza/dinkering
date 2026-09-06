import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTimeRange, formatMoney } from "@/lib/format";
import { mergeCourts, formatCourtTime, overallCourtTimeRange } from "@/lib/court-format";
import type { Booking, BookingAttendance, BookingCourt, Player } from "@/lib/types";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function BookingPrintSheet({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();
  if (!booking) notFound();
  const b = booking as Booking;
  const [{ data: attendance }, { data: courts }] = await Promise.all([
    supabase
      .from("booking_attendance")
      .select("*, players(name)")
      .eq("booking_id", id),
    supabase.from("booking_courts").select("*").eq("booking_id", id).order("created_at"),
  ]);
  const roster = (attendance ?? []) as (BookingAttendance & {
    players: Pick<Player, "name"> | null;
  })[];
  const courtList = (courts ?? []) as BookingCourt[];
  const merged = mergeCourts(courtList);
  const going = roster.filter((r) => r.response_status === "going");

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 print:p-0">
      <div className="no-print mb-4 flex gap-2">
        <Link href={`/admin/bookings/${id}`} className="text-sm font-semibold text-emerald-700">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <h1 className="text-2xl font-bold">{b.booking_code ?? "Session"}</h1>
      <p className="mt-1 text-slate-700">
        {formatDate(b.play_date)}
        {b.start_time ? ` · ${formatTimeRange(b.start_time, b.end_time)}` : ""}
      </p>
      {b.venue ? <p className="text-slate-700">Venue: {b.venue}</p> : null}
      <p className="mt-1 text-slate-700">Cost: {formatMoney(b.total_booking_cost)}</p>
      {merged.length > 0 ? (
        <ul className="mt-3 text-sm">
          {merged.map((m, i) => (
            <li key={i}>
              {m.label}: {formatCourtTime(m) || overallCourtTimeRange(courtList) || "—"}
            </li>
          ))}
        </ul>
      ) : null}

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Going ({going.length})</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Player</th>
            <th className="py-1">RSVP</th>
            <th className="py-1">Attended</th>
          </tr>
        </thead>
        <tbody>
          {[...roster]
            .sort((a, b) => (a.players?.name ?? "").localeCompare(b.players?.name ?? ""))
            .map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1.5">{r.players?.name}</td>
                <td className="py-1.5">{r.response_status.replace("_", " ")}</td>
                <td className="py-1.5">☐</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
