export function PublicPageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <div
        className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
        aria-hidden
      />
      <p className="mt-4 text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-sm text-slate-500">This can take a few seconds.</p>
    </main>
  );
}