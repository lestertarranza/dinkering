"use server";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  normalizeLoginEmail,
  recoverFailureMessage,
  resetRedirectUrl,
} from "@/lib/password-reset";
import { safeNextPath } from "@/lib/account-fields";

export async function requestPasswordReset(
  email: string,
  next: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleaned = normalizeLoginEmail(email);
  if (!cleaned) return { ok: false, error: "Enter the email on your login." };

  const base = await getAppBaseUrl();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !supabaseUrl || !anonKey) {
    return { ok: false, error: "Could not send the email. Try again in a minute." };
  }

  const url = new URL(`${supabaseUrl}/auth/v1/recover`);
  url.searchParams.set("redirect_to", resetRedirectUrl(base, safeNextPath(next)));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: cleaned }),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    const body: unknown = await res.json().catch(() => null);
    const error = recoverFailureMessage(res.status, body);
    if (!error) return { ok: true };
    return { ok: false, error };
  } catch {
    return { ok: false, error: "Could not send the email. Try again in a minute." };
  }
}
