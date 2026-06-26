import { formatTime } from "@/lib/format";

export type CourtLike = {
  court_number: string | null;
  start_time: string | null;
  end_time: string | null;
  hours?: number;
  max_players?: number;
};

/** Add a "Court " prefix to a court number unless it already has one. */
export function formatCourtNumber(courtNumber: string | null): string {
  const raw = (courtNumber ?? "").trim();
  if (!raw) return "Court";
  return /^court\b/i.test(raw) ? raw : `Court ${raw}`;
}

export type MergedCourt = {
  label: string; // e.g. "Court 2"
  start_time: string | null;
  end_time: string | null;
  maxPlayers: number; // summed; 0 = unlimited (any court unlimited → 0)
};

/**
 * Group courts by court number and merge their time ranges into one span
 * (earliest start → latest end). Max players are summed per court number.
 */
export function mergeCourts(courts: CourtLike[]): MergedCourt[] {
  const groups = new Map<string, CourtLike[]>();
  for (const c of courts) {
    const key = formatCourtNumber(c.court_number);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const result: MergedCourt[] = [];
  for (const [label, list] of groups) {
    const starts = list.map((c) => c.start_time).filter(Boolean) as string[];
    const ends = list.map((c) => c.end_time).filter(Boolean) as string[];
    const minStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
    const maxEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;
    const anyUnlimited = list.some((c) => (c.max_players ?? 0) === 0);
    const maxPlayers = anyUnlimited
      ? 0
      : list.reduce((s, c) => s + (c.max_players ?? 0), 0);
    result.push({ label, start_time: minStart, end_time: maxEnd, maxPlayers });
  }

  // Sort by start time, then label
  result.sort((a, b) => {
    const sa = a.start_time ?? "";
    const sb = b.start_time ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return result;
}

/** Overall earliest start → latest end across all courts, formatted. */
export function overallCourtTimeRange(courts: CourtLike[]): string {
  const starts = courts.map((c) => c.start_time).filter(Boolean) as string[];
  const ends = courts.map((c) => c.end_time).filter(Boolean) as string[];
  if (starts.length === 0 && ends.length === 0) return "";
  const minStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const maxEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;
  if (minStart && maxEnd) return `${formatTime(minStart)} – ${formatTime(maxEnd)}`;
  return formatTime(minStart || maxEnd || "");
}

/** Format a single merged court's time range, e.g. "12:00 PM – 6:00 PM". */
export function formatCourtTime(c: MergedCourt): string {
  if (c.start_time && c.end_time)
    return `${formatTime(c.start_time)} – ${formatTime(c.end_time)}`;
  if (c.start_time) return `From ${formatTime(c.start_time)}`;
  return "";
}
