import { formatDate } from "@/lib/format";
import type { ActivityRow } from "@/lib/activity-log";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatDate(iso.slice(0, 10));
  return d.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ActivityLog({
  rows,
  emptyHint,
}: {
  rows: ActivityRow[];
  emptyHint?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-500">
        {emptyHint ??
          "Nothing here yet. This list updates when a player RSVPs on their private page, or when you change RSVP / attendance on a booking."}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-2.5 text-sm">
          <p className="font-medium text-slate-800">{r.action}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {formatWhen(r.created_at)}
            {r.actor_email ? ` · ${r.actor_email}` : ""}
            {r.details ? ` · ${r.details}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
