import Link from "next/link";
import { formatDate } from "@/lib/format";

type CalBooking = {
  id: string;
  play_date: string;
  booking_code: string | null;
  status: string;
  venue: string | null;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BookingCalendar({
  bookings,
  view,
  month,
}: {
  bookings: CalBooking[];
  view: "week" | "month";
  month: string;
}) {
  const monthDate = new Date(`${month}-01T00:00:00`);
  const byDate = new Map<string, CalBooking[]>();
  for (const b of bookings) {
    const list = byDate.get(b.play_date) ?? [];
    list.push(b);
    byDate.set(b.play_date, list);
  }

  const days: Date[] = [];
  if (view === "week") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
  } else {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const pad = start.getDay();
    const first = new Date(start);
    first.setDate(1 - pad);
    for (let i = 0; i < 42; i++) {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      days.push(d);
    }
  }

  const prevMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
  const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link
            href={`/admin/bookings?cal=week`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              view === "week"
                ? "bg-emerald-600 text-white"
                : "ring-1 ring-slate-200 text-slate-700"
            }`}
          >
            Week
          </Link>
          <Link
            href={`/admin/bookings?cal=month&month=${month}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              view === "month"
                ? "bg-emerald-600 text-white"
                : "ring-1 ring-slate-200 text-slate-700"
            }`}
          >
            Month
          </Link>
        </div>
        {view === "month" ? (
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/admin/bookings?cal=month&month=${ymd(prevMonth).slice(0, 7)}`}
              className="font-semibold text-emerald-700"
            >
              ←
            </Link>
            <span className="font-medium text-slate-800">
              {monthDate.toLocaleDateString("en-PH", {
                month: "long",
                year: "numeric",
              })}
            </span>
            <Link
              href={`/admin/bookings?cal=month&month=${ymd(nextMonth).slice(0, 7)}`}
              className="font-semibold text-emerald-700"
            >
              →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-slate-500">This week</p>
        )}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-slate-50 px-1 py-1 text-center text-[10px] font-bold uppercase text-slate-500"
          >
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = ymd(d);
          const items = byDate.get(key) ?? [];
          const inMonth = d.getMonth() === monthDate.getMonth();
          return (
            <div
              key={key}
              className={`min-h-16 bg-white p-1 ${
                view === "month" && !inMonth ? "bg-slate-50 text-slate-400" : ""
              }`}
            >
              <p className="text-[11px] font-semibold">{d.getDate()}</p>
              {items.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/bookings/${b.id}`}
                  className="mt-0.5 block truncate rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-800"
                  title={formatDate(b.play_date)}
                >
                  {b.booking_code ?? "Game"}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
