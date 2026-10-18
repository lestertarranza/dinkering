"use client";

import { useState } from "react";

const OPTIONS = [
  ["attended", "Attended"],
  ["absent", "Absent"],
  ["late_cancel", "Late cancel"],
  ["guest", "Guest"],
] as const;

/**
 * Controlled so a successful save does not snap the menu back to the
 * first suggestion. Waitlisted players start on Absent; after they are
 * marked Attended the saved status has to stay selected.
 */
export function AttendanceStatusSelect({
  savedStatus,
  suggestedStatus,
}: {
  savedStatus: string | null;
  suggestedStatus: string;
}) {
  const [value, setValue] = useState(savedStatus ?? suggestedStatus);
  const [seenSaved, setSeenSaved] = useState(savedStatus);
  if (savedStatus !== seenSaved) {
    setSeenSaved(savedStatus);
    setValue(savedStatus ?? suggestedStatus);
  }

  return (
    <select
      name="actual_status"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
    >
      {OPTIONS.map(([status, label]) => (
        <option key={status} value={status}>
          {label}
        </option>
      ))}
    </select>
  );
}
