import { formatMoney } from "@/lib/format";

export function SplitPreview({
  totalCost,
  playerNames,
}: {
  totalCost: number;
  playerNames: string[];
}) {
  const n = playerNames.length;
  if (n === 0) return null;
  const each = totalCost / n;
  return (
    <div className="border-b border-slate-100 px-4 py-3 text-sm">
      <p className="font-semibold text-slate-800">Split preview</p>
      <p className="mt-1 text-slate-600">
        {formatMoney(totalCost)} across {n} player{n === 1 ? "" : "s"} ={" "}
        <span className="font-semibold text-slate-900">{formatMoney(each)}</span>{" "}
        each
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {playerNames.slice(0, 8).join(", ")}
        {playerNames.length > 8 ? ` +${playerNames.length - 8} more` : ""}
      </p>
    </div>
  );
}
