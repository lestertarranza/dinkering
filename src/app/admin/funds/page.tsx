import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  PageHeader,
  Badge,
  Field,
  inputClass,
  EmptyState,
} from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney, SETTLE_TOLERANCE } from "@/lib/format";
import { loadClubFundCashSummaries } from "@/lib/club-fund-cash";
import type { ClubItemFund } from "@/lib/types";
import { createFund } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClubFundsPage() {
  const supabase = await createClient();
  const [{ data: funds }, { byFund }] = await Promise.all([
    supabase.from("club_item_funds").select("*").order("name"),
    loadClubFundCashSummaries(supabase),
  ]);

  const list = ((funds ?? []) as ClubItemFund[]).map((f) => ({
    ...f,
    cash: byFund.get(f.id) ?? {
      billed: 0,
      collected: 0,
      unpaid: 0,
      manualIn: 0,
      spent: 0,
      available: 0,
    },
  }));
  const active = list.filter((f) => f.status !== "archived");
  const archived = list.filter((f) => f.status === "archived");
  const totalInPot = active.reduce((s, f) => s + f.cash.available, 0);
  const totalCollected = active.reduce((s, f) => s + f.cash.collected, 0);
  const totalUnpaid = active.reduce((s, f) => s + f.cash.unpaid, 0);

  return (
    <div>
      <PageHeader
        title="Club items"
        description="Charge games toward a pot (pickleballs). The pot only counts money after players pay. Record shop purchases against collected cash. The buyer is credited in their wallet. This is not a shared couple/family wallet."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            In pot
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalInPot < -SETTLE_TOLERANCE
                ? "text-rose-700"
                : "text-emerald-700"
            }`}
          >
            {totalInPot < -SETTLE_TOLERANCE
              ? `−${formatMoney(-totalInPot)}`
              : formatMoney(Math.max(0, totalInPot))}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Collected cash plus donations, minus purchases
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Collected
          </p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatMoney(totalCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Actually paid toward game contributions
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Unpaid
          </p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              totalUnpaid >= SETTLE_TOLERANCE
                ? "text-rose-700"
                : "text-slate-900"
            }`}
          >
            {formatMoney(totalUnpaid)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Charged but not yet paid
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-4 lg:order-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            New item fund
          </h2>
          <form action={createFund} className="space-y-3">
            <Field label="Name" hint="e.g. Pickleballs">
              <input name="name" required className={inputClass} />
            </Field>
            <Field
              label="Target (optional)"
              hint="How much you want sitting in this pot"
            >
              <input
                name="target_amount"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
            <SubmitButton>Create fund</SubmitButton>
          </form>
        </Card>

        <div className="lg:order-1 lg:col-span-2">
          {active.length === 0 ? (
            <EmptyState
              title="No club item funds yet"
              description="Create a pot for pickleballs or other gear, then add the money you have set aside."
            />
          ) : (
            <div className="space-y-3">
              {active.map((f) => {
                const target = Number(f.target_amount) || 0;
                const inPot = f.cash.available;
                const pct =
                  target > 0
                    ? Math.min(
                        100,
                        Math.round((Math.max(0, inPot) / target) * 100),
                      )
                    : null;
                return (
                  <Link
                    key={f.id}
                    href={`/admin/funds/${f.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{f.name}</p>
                        {f.notes ? (
                          <p className="mt-0.5 truncate text-sm text-slate-500">
                            {f.notes}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          Collected {formatMoney(f.cash.collected)}
                          {f.cash.unpaid >= SETTLE_TOLERANCE
                            ? ` · ${formatMoney(f.cash.unpaid)} unpaid`
                            : ""}
                          {f.cash.billed > 0
                            ? ` of ${formatMoney(f.cash.billed)} charged`
                            : ""}
                        </p>
                        {pct !== null ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {pct}% of {formatMoney(target)} target
                          </p>
                        ) : null}
                      </div>
                      <p
                        className={`shrink-0 text-lg font-semibold ${
                          inPot < -SETTLE_TOLERANCE
                            ? "text-rose-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {inPot < -SETTLE_TOLERANCE
                          ? `−${formatMoney(-inPot)}`
                          : formatMoney(inPot)}
                      </p>
                    </div>
                    {pct !== null ? (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}

          {archived.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-slate-500">
                Archived
              </h2>
              <ul className="space-y-2">
                {archived.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/admin/funds/${f.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2">
                        {f.name}
                        <Badge>Archived</Badge>
                      </span>
                      <span>{formatMoney(f.cash.available)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
