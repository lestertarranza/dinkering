"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm font-semibold text-slate-700"
    >
      Print
    </button>
  );
}
