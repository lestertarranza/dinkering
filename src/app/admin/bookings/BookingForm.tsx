"use client";

import { useState, type ReactNode } from "react";
import { Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";
import { formatMoney } from "@/lib/format";
import type { FormAction } from "@/lib/action-state";
import type { Booking } from "@/lib/types";

function BookingFields({
  booking,
  courts,
  setCourts,
  hours,
  setHours,
  rate,
  setRate,
  other,
  setOther,
  total,
}: {
  booking?: Partial<Booking>;
  courts: number;
  setCourts: (n: number) => void;
  hours: number;
  setHours: (n: number) => void;
  rate: number;
  setRate: (n: number) => void;
  other: number;
  setOther: (n: number) => void;
  total: number;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Booking code">
          <input
            name="booking_code"
            defaultValue={booking?.booking_code ?? ""}
            placeholder="auto (PB-001)"
            className={inputClass}
          />
        </Field>
        <Field label="Play date">
          <input
            name="play_date"
            type="date"
            required
            defaultValue={booking?.play_date ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start time">
          <input
            name="start_time"
            type="time"
            defaultValue={booking?.start_time ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="End time">
          <input
            name="end_time"
            type="time"
            defaultValue={booking?.end_time ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Venue">
        <input
          name="venue"
          defaultValue={booking?.venue ?? ""}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Court number">
          <input
            name="court_number"
            defaultValue={booking?.court_number ?? ""}
            placeholder="e.g. Court 3"
            className={inputClass}
          />
        </Field>
        <Field label="Booking reference">
          <input
            name="booking_reference"
            defaultValue={booking?.booking_reference ?? ""}
            placeholder="venue ref #"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Courts">
          <input
            name="courts_booked"
            type="number"
            step="0.5"
            min="0"
            value={courts}
            onChange={(e) => setCourts(parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Hours">
          <input
            name="hours"
            type="number"
            step="0.5"
            min="0"
            value={hours}
            onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rate / court / hr">
          <input
            name="rate_per_court_per_hour"
            type="number"
            step="0.01"
            min="0"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
        <Field label="Other fees">
          <input
            name="other_fees"
            type="number"
            step="0.01"
            min="0"
            value={other}
            onChange={(e) => setOther(parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Status">
        <select
          name="status"
          defaultValue={booking?.status ?? "booked"}
          className={inputClass}
        >
          <option value="booked">Booked</option>
          <option value="played">Played</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea
          name="notes"
          defaultValue={booking?.notes ?? ""}
          rows={2}
          className={inputClass}
        />
      </Field>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Booking confirmation screenshot
        </label>
        {booking?.confirmation_url ? (
          <div className="mb-2 flex items-center gap-3">
            <a href={booking.confirmation_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={booking.confirmation_url}
                alt="Booking confirmation"
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 hover:ring-emerald-400"
              />
            </a>
            <span className="text-xs text-slate-400">
              Existing confirmation ·{" "}
              <a href={booking.confirmation_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                View ↗
              </a>
            </span>
          </div>
        ) : null}
        <input
          name="confirmation_screenshot"
          type="file"
          accept="image/*"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
        />
        <p className="mt-1 text-xs text-slate-400">
          Optional — upload the venue's booking receipt/screenshot. Shown to players on their portal.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
        <span className="text-sm font-medium text-emerald-800">
          Total booking cost
        </span>
        <span className="text-lg font-semibold text-emerald-700">
          {formatMoney(total)}
        </span>
      </div>
    </>
  );
}

export function BookingForm({
  action,
  booking,
  submitLabel = "Save booking",
  feedback = false,
  pendingLabel = "Saving…",
}: {
  action: FormAction | ((formData: FormData) => void | Promise<void>);
  booking?: Partial<Booking>;
  submitLabel?: string;
  /** When true, show success/error feedback (requires a FormAction). */
  feedback?: boolean;
  pendingLabel?: string;
}) {
  const [courts, setCourts] = useState(booking?.courts_booked ?? 1);
  const [hours, setHours] = useState(booking?.hours ?? 1);
  const [rate, setRate] = useState(booking?.rate_per_court_per_hour ?? 0);
  const [other, setOther] = useState(booking?.other_fees ?? 0);

  const total =
    Number(courts) * Number(hours) * Number(rate) + Number(other);

  const fields = (
    <BookingFields
      booking={booking}
      courts={courts}
      setCourts={setCourts}
      hours={hours}
      setHours={setHours}
      rate={rate}
      setRate={setRate}
      other={other}
      setOther={setOther}
      total={total}
    />
  );

  const submit = (
    <SubmitButton className="w-full" pendingLabel={pendingLabel}>
      {submitLabel}
    </SubmitButton>
  );

  const hidden: ReactNode =
    booking?.id ? <input type="hidden" name="id" value={booking.id} /> : null;

  if (feedback) {
    return (
      <ActionForm
        action={action as FormAction}
        className="space-y-3"
        pendingLabel={pendingLabel}
        hidden={hidden}
        multipart
      >
        {fields}
        {submit}
      </ActionForm>
    );
  }

  return (
    <form
      action={action as (formData: FormData) => void | Promise<void>}
      className="space-y-3"
      encType="multipart/form-data"
    >
      {hidden}
      {fields}
      {submit}
    </form>
  );
}
