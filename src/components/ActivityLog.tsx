import { formatDate } from "@/lib/format";
import type { ActivityRow } from "@/lib/activity-log";

export function ActivityLog({
  rows,
}: {
  rows: ActivityRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-400">No admin actions logged yet.</p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-2.5 text-sm">
          <p className="font-medium text-slate-800">{r.action}</p>
          <p className="text-xs text-slate-400">
            {formatDate(r.created_at.slice(0, 10))}
            {r.actor_email ? ` · ${r.actor_email}` : ""}
            {r.details ? ` · ${r.details}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
