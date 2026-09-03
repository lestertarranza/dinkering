"use client";

import { buildBookingIcs, type CalendarEvent } from "@/lib/ics";

export function AddToCalendar({
  event,
  filename,
}: {
  event: CalendarEvent;
  filename: string;
}) {
  function download() {
    const ics = buildBookingIcs(event);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const title = event.title;
    const text = [event.venue, event.notes].filter(Boolean).join(" · ");
    const url = event.url ?? window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      // user cancelled or share failed — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={download}
        className="inline-flex min-h-11 touch-manipulation items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
      >
        📅 Add to calendar
      </button>
      <button
        type="button"
        onClick={share}
        className="inline-flex min-h-11 touch-manipulation items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
      >
        Share
      </button>
    </div>
  );
}
