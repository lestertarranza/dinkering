"use client";

import { Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

type FundOpt = { id: string; name: string };

export function BookingFundContributionForm({
  bookingId,
  funds,
  playerCount,
}: {
  bookingId: string;
  funds: FundOpt[];
  playerCount: number;
}) {
  if (funds.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Create a club item fund first (Club items in the sidebar), then you can
        charge this game toward it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="booking_id" value={bookingId} />
      <Field label="Fund" hint="Where this game's contribution goes">
        <select name="fund_id" required className={inputClass}>
          <option value="">Select fund…</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Amount per player"
        hint="Charged to Going or attended players on this booking"
      >
        <input
          name="amount_per_player"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="20.00"
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-slate-500">
        {playerCount > 0
          ? `Will charge ${playerCount} player${playerCount === 1 ? "" : "s"}. Who paid shows with court fees under Player shares & payments. The pot only counts money after they pay.`
          : "No Going or attended players to charge yet."}
      </p>
      <SubmitButton className="w-full" pendingLabel="Charging…">
        Charge this game
      </SubmitButton>
    </div>
  );
}
