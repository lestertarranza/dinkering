import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-3xl shadow-lg">
        🏓
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Dinkering Pickleball Team Manager
      </h1>
      <p className="mt-4 max-w-md text-slate-600">
        A ledger-based tracker for court bookings, attendance, payments, advance
        credits, pooled family funds, and shared team expenses.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          Admin sign in
        </Link>
      </div>
      <p className="mt-10 max-w-md text-xs text-slate-400">
        Players don&apos;t need an account — each player and pooled group gets a
        private, read-only link to view their balance, schedule, and full ledger
        history.
      </p>
    </main>
  );
}
