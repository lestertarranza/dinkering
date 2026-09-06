"use client";

import { Field, inputClass } from "@/components/ui";
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
        <select name="payer" required className={inputClass}>
          <option value="">Select buyer…</option>
          {groups.length > 0 ? (
            <optgroup label="Groups / pooled funds">
              {groups.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Players">
            {players.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        </select>
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
