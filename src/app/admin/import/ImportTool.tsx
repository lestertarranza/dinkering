"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { Card, buttonClass, Badge } from "@/components/ui";

type Parsed = {
  players: Record<string, unknown>[];
  bookings: Record<string, unknown>[];
  playerShares: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  teamExpenses: Record<string, unknown>[];
  expenseShares: Record<string, unknown>[];
};

const empty: Parsed = {
  players: [],
  bookings: [],
  playerShares: [],
  payments: [],
  teamExpenses: [],
  expenseShares: [],
};

/**
 * Convert a worksheet to row objects, auto-detecting the real header row.
 * The Google Sheet template puts a title + description above the headers,
 * so we skip leading rows until we find one with several filled cells.
 */
function sheetToObjects(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  const filled = (r: unknown[]) =>
    r.filter((c) => c != null && String(c).trim() !== "").length;

  let headerIdx = -1;
  for (let i = 0; i < aoa.length; i++) {
    if (filled(aoa[i]) >= 3) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = aoa[headerIdx].map((h) => (h == null ? "" : String(h)));
  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (filled(r) === 0) continue;
    const o: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) o[h] = cellValue(r[j]);
    });
    out.push(o);
  }
  return out;
}

/**
 * Normalize a cell. Excel date cells are read by `xlsx` as JS Dates at
 * local midnight; we emit the LOCAL calendar day (YYYY-MM-DD) so the
 * intended date survives JSON/UTC round-trips instead of slipping a day.
 */
function cellValue(v: unknown): unknown {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return v ?? null;
}

function classify(sheetName: string): keyof Parsed | null {
  const n = sheetName.toLowerCase();
  const isShare = n.includes("share");
  if (isShare && n.includes("expense")) return "expenseShares";
  if (isShare && n.includes("player")) return "playerShares";
  if (n.includes("expense")) return "teamExpenses";
  if (n.includes("payment")) return "payments";
  if (n.includes("booking") && !n.includes("summary")) return "bookings";
  if (n.includes("player") && !isShare) return "players";
  return null;
}

export function ImportTool() {
  const [parsed, setParsed] = useState<Parsed>(empty);
  const [fileName, setFileName] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [wipe, setWipe] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    phase: string;
    current: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<{
    counts?: Record<string, number>;
    warnings?: string[];
    error?: string;
  } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const next: Parsed = {
      players: [],
      bookings: [],
      playerShares: [],
      payments: [],
      teamExpenses: [],
      expenseShares: [],
    };
    const skipped: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const key = classify(sheetName);
      const rows = sheetToObjects(wb.Sheets[sheetName]);
      if (key) next[key] = next[key].concat(rows);
      else if (rows.length) skipped.push(sheetName);
    }
    setParsed(next);
    setUnmatched(skipped);
  }

  async function runImport() {
    setBusy(true);
    setResult(null);
    setProgress({ phase: "Starting…", current: 0, total: 0 });
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed, wipe }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        setResult({ error: text || `Request failed (${res.status})` });
        return;
      }

      // Read the NDJSON progress stream line-by-line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as {
            type: string;
            phase?: string;
            current?: number;
            total?: number;
            counts?: Record<string, number>;
            warnings?: string[];
            error?: string;
          };
          if (ev.type === "progress") {
            setProgress({
              phase: ev.phase ?? "",
              current: ev.current ?? 0,
              total: ev.total ?? 0,
            });
          } else if (ev.type === "done") {
            setResult({ counts: ev.counts, warnings: ev.warnings });
          } else if (ev.type === "error") {
            setResult({ error: ev.error });
          }
        }
      }
    } catch (err) {
      setResult({ error: String(err) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const summary: { key: keyof Parsed; label: string }[] = [
    { key: "players", label: "Players" },
    { key: "bookings", label: "Bookings" },
    { key: "playerShares", label: "Player shares" },
    { key: "payments", label: "Payments" },
    { key: "teamExpenses", label: "Team expenses" },
    { key: "expenseShares", label: "Expense shares" },
  ];

  const totalRows = summary.reduce((s, t) => s + parsed[t.key].length, 0);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Select your Google Sheet export (.xlsx)
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFile}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-700"
          />
        </label>
        {fileName ? (
          <p className="mt-2 text-xs text-slate-400">Loaded: {fileName}</p>
        ) : null}
      </Card>

      {fileName ? (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Detected data
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {summary.map((t) => (
              <div
                key={t.key}
                className="rounded-lg border border-slate-200 px-3 py-2"
              >
                <p className="text-xs text-slate-500">{t.label}</p>
                <p className="text-lg font-semibold text-slate-900">
                  {parsed[t.key].length}
                </p>
              </div>
            ))}
          </div>
          {unmatched.length > 0 ? (
            <p className="mt-3 text-xs text-amber-600">
              Ignored sheets: {unmatched.join(", ")}
            </p>
          ) : null}

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={wipe}
              onChange={(e) => {
                setWipe(e.target.checked);
                if (!e.target.checked) setWipeConfirm("");
              }}
            />
            Wipe all existing data before importing (recommended for first
            import)
          </label>

          {wipe ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm font-medium text-rose-800">
                This permanently deletes all players, bookings, payments,
                expenses, and ledger entries.
              </p>
              <label className="mt-2 block text-sm text-rose-700">
                Type <strong>DELETE</strong> to confirm
                <input
                  type="text"
                  value={wipeConfirm}
                  onChange={(e) => setWipeConfirm(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-base text-slate-900"
                  autoComplete="off"
                />
              </label>
            </div>
          ) : null}

          <button
            onClick={() => {
              if (wipe && wipeConfirm !== "DELETE") return;
              runImport();
            }}
            disabled={
              busy || totalRows === 0 || (wipe && wipeConfirm !== "DELETE")
            }
            className={buttonClass("primary", "mt-4")}
          >
            {busy ? "Importing…" : "Import data"}
          </button>

          {busy && progress ? (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>{progress.phase}</span>
                <span>
                  {progress.total > 0
                    ? `${progress.current} / ${progress.total}`
                    : ""}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-150"
                  style={{
                    width:
                      progress.total > 0
                        ? `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`
                        : "15%",
                  }}
                />
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <Card className="p-4">
          {result.error ? (
            <p className="text-sm text-rose-600">Error: {result.error}</p>
          ) : (
            <>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                Import complete <Badge tone="going">Done</Badge>
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(result.counts ?? {}).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-500">{k}: </span>
                    <span className="font-semibold">{v}</span>
                  </div>
                ))}
              </div>
              {(result.warnings ?? []).length > 0 ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-amber-600">
                    {result.warnings!.length} warning(s)
                  </summary>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-500">
                    {result.warnings!.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
