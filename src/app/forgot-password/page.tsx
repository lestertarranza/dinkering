"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { buttonClass, inputClass } from "@/components/ui";
import { requestPasswordReset } from "@/app/auth/password-actions";

function ForgotPasswordForm() {
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await requestPasswordReset(email, next);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  const signInHref = next
    ? `/login?next=${encodeURIComponent(next)}`
    : "/login";

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We'll email you a link to choose a new one."
    >
      {sent ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            Check your email. If this address has a login, you will get a link
            to choose a new password. The link expires after a while.
          </p>
          <button
            type="button"
            className={buttonClass("secondary", "w-full")}
            onClick={() => setSent(false)}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className={buttonClass("primary", "w-full")}
          >
            {loading ? "Sending…" : "Email me a reset link"}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href={signInHref} className="font-medium text-emerald-700">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
