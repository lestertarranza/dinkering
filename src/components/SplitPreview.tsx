import { formatMoney } from "@/lib/format";
import type { CourtSplitPreview } from "@/lib/court-split-preview";

export function SplitPreview({ preview }: { preview: CourtSplitPreview }) {
  const n = preview.seatNames.length;
  if (n === 0) return null;
  const absentLabel =
    preview.absentCount === 1 ? "player" : "players";
  const absentVerb = preview.absentCount === 1 ? "comes" : "come";
  return (
    <div className="border-b border-slate-100 px-4 py-3 text-sm">
      <p className="font-semibold text-slate-800">Split preview</p>
      {preview.each != null ? (
        <p className="mt-1 text-slate-600">
          {formatMoney(preview.pool)} across {n} player{n === 1 ? "" : "s"} ={" "}
          <span className="font-semibold text-slate-900">
            {formatMoney(preview.each)}
          </span>{" "}
          each
        </p>
      ) : (
        <p className="mt-1 text-slate-600">
          {formatMoney(preview.pool)} left for {n} player{n === 1 ? "" : "s"}.
          Shares follow the units and overrides below.
        </p>
      )}
      {preview.absentCount > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          {preview.absentCount} absent {absentLabel}{" "}
          {preview.absentEach != null ? (
            <>
              at {formatMoney(preview.absentEach)} each (
              {formatMoney(preview.absentTotal)})
            </>
          ) : (
            <>totaling {formatMoney(preview.absentTotal)}</>
          )}{" "}
          {absentVerb} out of the {formatMoney(preview.totalCost)} court cost
          first. They are not part of this split.
        </p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">
        {preview.seatNames.slice(0, 8).join(", ")}
        {preview.seatNames.length > 8
          ? ` +${preview.seatNames.length - 8} more`
          : ""}
      </p>
    </div>
  );
}
