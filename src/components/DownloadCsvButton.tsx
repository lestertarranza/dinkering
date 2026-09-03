"use client";

export function DownloadCsvButton({
  filename,
  rows,
  label = "Export CSV",
}: {
  filename: string;
  rows: string[][];
  label?: string;
}) {
  function download() {
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const v = cell ?? "";
            if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
            return v;
          })
          .join(","),
      )
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}
