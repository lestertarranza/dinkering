"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate } from "@/lib/format";

type Opt = { id: string; name: string };
type BookingOpt = { id: string; booking_code: string | null; play_date: string };

export function ExpenseForm({
  action,
  players,
  groups,
  bookings,
}: {
  action: (formData: FormData) => void | Promise<void>;
  players: Opt[];
  groups: Opt[];
  bookings: BookingOpt[];
}) {
  const [method, setMethod] = useState("active_players");

  return (
    <form action={action} className="space-y-3">
      <Field label="Description" hint="e.g. 3 tubes of pickleballs">
        <input name="description" required className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Purchase date">
          <input
            name="purchase_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>
        <Field label="Total cost">
          <input
            name="total_cost"
            type="number"
            step="0.01"
            min="0"
            required
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Paid by (buyer)" hint="Buyer is reimbursed the full amount">
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
      <Field label="Split method">
        <select
          name="split_method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className={inputClass}
        >
          <option value="active_players">All active players</option>
          <option value="selected_players">Selected players</option>
          <option value="attendees">Attendees of a booking</option>
          <option value="custom">Custom (pick players, edit later)</option>
        </select>
      </Field>

      {method === "selected_players" || method === "custom" ? (
        <Field label="Players" hint="Hold Ctrl/Cmd to select several">
          <select
            name="selected_players"
            multiple
            size={6}
            className={inputClass}
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {method === "attendees" ? (
        <Field label="Booking">
          <select name="booking_id" className={inputClass}>
            <option value="">Select booking…</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.booking_code} · {formatDate(b.play_date)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Notes">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
      <SubmitButton className="w-full">Add expense &amp; split</SubmitButton>
    </form>
  );
}
