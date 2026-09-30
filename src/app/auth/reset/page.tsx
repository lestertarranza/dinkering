"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { buttonClass, inputClass } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/account-fields";
import { createClient } from "@/lib/supabase/client";
import {
  passwordChoiceError,
  passwordUpdateMessage,
  readResetLink,
  resetPagePath,
} from "@/lib/password-reset";

type Phase = "opening" | "form" | "invalid";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [phase, setPhase] = useState<Phase>("opening");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function openLink() {
      const supabase = createClient();
      const link = readResetLink(window.location.href);
      const clean = () => {
        window.history.replaceState(null, "", resetPagePath(window.location.href));
      };
      if (link.kind === "invalid") {
        if (!cancelled) setPhase("invalid");
        return;
      }
      if (link.kind === "session") {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        });
        clean();
        if (!cancelled) setPhase(sessionError ? "invalid" : "form");
        return;
      }
      if (link.kind === "code") {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(
          link.code,
        );
        clean();
        if (!cancelled) setPhase(codeError ? "invalid" : "form");
        return;
      }
      if (link.kind === "otp") {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: link.tokenHash,
          type: "recovery",
        });
        clean();
        if (!cancelled) setPhase(otpError ? "invalid" : "form");
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setPhase(data.user ? "form" : "invalid");
    }
    void openLink();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const choice = passwordChoiceError(password, confirm);
    if (choice) {
      setError(choice);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(passwordUpdateMessage(updateError.message));
      setLoading(false);
      return;
    }
    const dest = next
      ? `/auth/continue?next=${encodeURIComponent(next)}`
      : "/auth/continue";
    router.push(dest);
    router.refresh();
  }

  const requestHref = next
    ? `/forgot-password?next=${encodeURIComponent(next)}`
    : "/forgot-password";

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use this the next time you sign in."
    >
      {phase === "opening" ? (
        <p className="text-center text-sm text-slate-500">Checking the reset link…</p>
      ) : null}
      {phase === "invalid" ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            This reset link is invalid or has expired.
          </p>
          <Link href={requestHref} className={buttonClass("primary", "w-full")}>
            Request a new link
          </Link>
        </div>
      ) : null}
      {phase === "form" ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-slate-400">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
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
            {loading ? "Saving…" : "Save password"}
          </button>
        </form>
      ) : null}
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-emerald-700">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
