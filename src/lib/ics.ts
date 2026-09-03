/** Build a VTIMEZONE-free ICS event in Asia/Manila (UTC+8, no DST). */
function toIcsUtcStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function toPhDate(playDate: string, time: string | null, fallback: string): Date {
  const t = (time && time.trim()) || fallback;
  const parts = t.split(":");
  const h = (parts[0] ?? "00").padStart(2, "0");
  const m = (parts[1] ?? "00").padStart(2, "0");
  const s = (parts[2] ?? "00").padStart(2, "0");
  return new Date(`${playDate}T${h}:${m}:${s}+08:00`);
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export type CalendarEvent = {
  uid: string;
  title: string;
  playDate: string;
  startTime: string | null;
  endTime: string | null;
  venue?: string | null;
  notes?: string | null;
  url?: string | null;
};

export function buildBookingIcs(event: CalendarEvent): string {
  const start = toPhDate(event.playDate, event.startTime, "07:00:00");
  const end = event.endTime
    ? toPhDate(event.playDate, event.endTime, "09:00:00")
    : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const desc = [event.notes?.trim(), event.url ? `Details: ${event.url}` : null]
    .filter(Boolean)
    .join("\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dinkering//Open Play//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(event.uid)}@dinkering`,
    `DTSTAMP:${toIcsUtcStamp(new Date())}`,
    `DTSTART:${toIcsUtcStamp(start)}`,
    `DTEND:${toIcsUtcStamp(end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.venue ? `LOCATION:${icsEscape(event.venue)}` : null,
    desc ? `DESCRIPTION:${desc}` : null,
    event.url ? `URL:${icsEscape(event.url)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));
  return lines.join("\r\n");
}
