import { formatMoney } from "@/lib/format";

export function SplitPreview({
  totalCost,
  playerNames,
  absentCount = 0,
  absentPenalty = 0,
}: {
  totalCost: number;
  playerNames: string[];
  absentCount?: number;
  absentPenalty?: number;
}) {
  const n = playerNames.length;
  if (n === 0) return null;
  const deduction = Math.max(0, absentCount) * Math.max(0, absentPenalty);
  const pool = Math.max(0, totalCost - deduction);
  const each = pool / n;
  return (
    <div className="border-b border-slate-100 px-4 py-3 text-sm">
      <p className="font-semibold text-slate-800">Split preview</p>
      <p className="mt-1 text-slate-600">
        {formatMoney(pool)} across {n} player{n === 1 ? "" : "s"} ={" "}
        <span className="font-semibold text-slate-900">{formatMoney(each)}</span>{" "}
        each
      </p>
      {absentCount > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          {absentCount} absent {absentCount === 1 ? "player" : "players"} at{" "}
          {formatMoney(absentPenalty)} each ({formatMoney(deduction)}) come out
          of the {formatMoney(totalCost)} court cost first. They are not part
          of this split.
        </p>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">
        {playerNames.slice(0, 8).join(", ")}
        {playerNames.length > 8 ? ` +${playerNames.length - 8} more` : ""}
      </p>
    </div>
  );
}
