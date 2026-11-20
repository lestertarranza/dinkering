"use client";

import { Field, inputClass } from "@/components/ui";
import { SearchSelect } from "@/components/SearchSelect";
import { SubmitButton } from "@/components/SubmitButton";

type Opt = { id: string; name: string };

export function BookingExpenseForm({
  bookingId,
  defaultDescription = "Pickleballs",
  players,
  groups,
}: {
  bookingId: string;
  defaultDescription?: string;
  players: Opt[];
  groups: Opt[];
}) {
  return (
    <div className="space-y-3">
      <input type="hidden" name="booking_id" value={bookingId} />
      <Field label="What is this?" hint="e.g. Pickleballs, water, extra fee">
        <input
          name="description"
          defaultValue={defaultDescription}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Total cost">
        <input
          name="total_cost"
          type="number"
          step="0.01"
          min="0.01"
          required
          className={inputClass}
        />
      </Field>
      <Field
        label="Paid by"
        hint="Buyer is reimbursed. Split across Going / attended players on this booking."
      >
        <SearchSelect
          name="payer"
          required
          placeholder="Search buyer…"
          options={[
            ...groups.map((g) => ({
              value: `g:${g.id}`,
              label: g.name,
              group: "Groups / pooled funds",
            })),
            ...players.map((p) => ({
              value: `p:${p.id}`,
              label: p.name,
              group: "Players",
            })),
          ]}
        />
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Adding…">
        Add to this session &amp; split
      </SubmitButton>
    </div>
  );
}
