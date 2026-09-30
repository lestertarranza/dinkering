"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { buttonClass } from "@/components/ui";
import { finishConfirmedSignup } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { readConfirmLink, resetPagePath } from "@/lib/password-reset";

type Phase = "opening" | "invalid" | "error";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("opening");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function openLink() {
      const supabase = createClient();
      const link = readConfirmLink(window.location.href);
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
        if (sessionError) {
          if (!cancelled) setPhase("invalid");
          return;
        }
      } else if (link.kind === "code") {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(link.code);
        clean();
        if (codeError) {
          if (!cancelled) setPhase("invalid");
          return;
        }
      } else if (link.kind === "otp") {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: link.tokenHash,
          type: "signup",
        });
        clean();
        if (otpError) {
          if (!cancelled) setPhase("invalid");
          return;
        }
      }

      const result = await finishConfirmedSignup();
      if (cancelled) return;
      if (!result?.ok) {
        setError(result?.message ?? "Could not finish the registration.");
        setPhase("error");
        return;
      }
      router.push(result.redirectTo ?? "/pending");
      router.refresh();
    }
    void openLink();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AuthShell title="Confirming your email" subtitle="This finishes the registration.">
      {phase === "opening" ? (
        <p className="text-center text-sm text-slate-500">Checking the confirmation link…</p>
      ) : null}
      {phase === "invalid" ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            This confirmation link is invalid or has expired.
          </p>
          <Link href="/register" className={buttonClass("primary", "w-full")}>
            Back to registration
          </Link>
        </div>
      ) : null}
      {phase === "error" ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-rose-700">{error}</p>
          <Link href="/register" className={buttonClass("secondary", "w-full")}>
            Back to registration
          </Link>
        </div>
      ) : null}
    </AuthShell>
  );
}
