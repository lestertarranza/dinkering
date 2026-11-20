"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { SearchMultiSelect, SearchSelect } from "@/components/SearchSelect";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDate, phTodayYmd } from "@/lib/format";

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
            defaultValue={phTodayYmd()}
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
      </div>
      <Field label="Paid by (buyer)" hint="Buyer is reimbursed the full amount">
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
        <Field label="Players" hint="Search for a player, then add another.">
          <SearchMultiSelect
            name="selected_players"
            placeholder="Search players…"
            options={players.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      ) : null}

      <Field
        label={method === "attendees" ? "Booking" : "Linked session (optional)"}
        hint={
          method === "attendees"
            ? "Split across Going / attended players of this booking"
            : "Optional. Ties this purchase to a game so it also shows on that booking."
        }
      >
        <select
          name="booking_id"
          className={inputClass}
          required={method === "attendees"}
        >
          <option value="">
            {method === "attendees" ? "Select booking…" : "None"}
          </option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.booking_code} · {formatDate(b.play_date)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes">
        <textarea name="notes" rows={2} className={inputClass} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Adding expense…">
        Add expense &amp; split
      </SubmitButton>
    </form>
  );
}
