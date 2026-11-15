"use client";

import { useEffect, useState } from "react";
import { SplitPreview } from "@/components/SplitPreview";
import {
  courtSplitPreview,
  type CourtSplitPreview,
  type CourtSplitRow,
} from "@/lib/court-split-preview";

function readRows(form: HTMLFormElement, rows: CourtSplitRow[]): CourtSplitRow[] {
  const data = new FormData(form);
  return rows.map((row) => {
    const overrideRaw = String(data.get(`override-${row.playerId}`) ?? "").trim();
    const unitsRaw = String(data.get(`units-${row.playerId}`) ?? "").trim();
    const units = parseFloat(unitsRaw);
    const override = overrideRaw === "" ? null : parseFloat(overrideRaw);
    return {
      ...row,
      included: data.get(`include-${row.playerId}`) === "on",
      units: Number.isFinite(units) ? units : 0,
      override: override != null && Number.isFinite(override) ? override : null,
    };
  });
}

/** Split preview that follows the share form, including Override ₱ as it is typed. */
export function LiveCourtSplitPreview({
  formId,
  totalCost,
  rows,
}: {
  formId: string;
  totalCost: number;
  rows: CourtSplitRow[];
}) {
  const signature = JSON.stringify({ totalCost, rows });
  const [source, setSource] = useState(signature);
  const [preview, setPreview] = useState<CourtSplitPreview>(() =>
    courtSplitPreview(totalCost, rows),
  );
  if (source !== signature) {
    setSource(signature);
    setPreview(courtSplitPreview(totalCost, rows));
  }

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const sync = () => setPreview(courtSplitPreview(totalCost, readRows(form, rows)));
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    return () => {
      form.removeEventListener("input", sync);
      form.removeEventListener("change", sync);
    };
  }, [formId, rows, totalCost]);

  return <SplitPreview preview={preview} />;
}
