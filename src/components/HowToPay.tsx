import { formatMoney } from "@/lib/format";

export function HowToPay({
  bank,
  gcash,
}: {
  bank?: string | null;
  gcash?: string | null;
}) {
  const b = bank?.trim() || null;
  const g = gcash?.trim() || null;
  if (!b && !g) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
          How to pay
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Bank transfer (BPI) is preferred. Prefer GCash? Message me and I&apos;ll
          send the details.
        </p>
      </div>
    );
  }

  const bankParts = b
    ? b
        .split("·")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-800">
        How to pay
      </h2>
      {b ? (
        <div className="mt-2 text-sm text-slate-800">
          <p className="font-semibold">Bank transfer (preferred)</p>
          {bankParts.length >= 3 ? (
            <>
              <p className="mt-0.5">{bankParts.slice(0, -1).join(" · ")}</p>
              <p className="font-medium">Account #: {bankParts[bankParts.length - 1]}</p>
            </>
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap">{b}</p>
          )}
        </div>
      ) : null}
      <p className="mt-2 text-sm text-slate-700">
        Prefer GCash? Message me and I&apos;ll send the details.
      </p>
      {g ? (
        <p className="mt-1 text-sm text-slate-600">GCash: {g}</p>
      ) : null}
    </div>
  );
}

export function BalancePlainSummary({
  amountOwed,
  openGames,
}: {
  amountOwed: number;
  openGames: number;
}) {
  if (amountOwed <= 0) return null;
  const games =
    openGames <= 0
      ? "open charges"
      : openGames === 1
        ? "1 game"
        : `${openGames} games`;
  return (
    <p className="mt-2 text-sm font-medium text-rose-800">
      You owe {formatMoney(amountOwed)} across {games}.
    </p>
  );
}
