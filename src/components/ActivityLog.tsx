import { formatDateTime } from "@/lib/format";
import { activityOrigin, type ActivityOrigin } from "@/lib/activity-origin";
import type { ActivityRow } from "@/lib/activity-log";

function originNote(origin: ActivityOrigin, details: string | null): string | null {
  if (origin.source === "waitlist") return "waitlist";
  if (origin.source === "default going") return "default Going";
  if (origin.source === "player page") return "player page";
  if (origin.source === "admin") return "admin";
  return details;
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
      {rows.map((r) => {
        const origin = activityOrigin(r);
        const note = originNote(origin, r.details);
        const auto = origin.kind === "automatic";
        return (
          <li key={r.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-slate-800">{r.action}</p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  auto
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {auto ? "Automatic" : "Manual"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {formatDateTime(r.created_at)} PHT
              {note ? ` · ${note}` : ""}
              {r.actor_email ? ` · ${r.actor_email}` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
