import { MIN_PASSWORD_LENGTH, safeNextPath } from "@/lib/account-fields";

export function normalizeLoginEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function passwordChoiceError(
  password: string,
  confirm: string,
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "Password and confirmation do not match.";
  }
  return null;
}

export function passwordUpdateMessage(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("different")) {
    return "Choose a different password than the one you use now.";
  }
  if (msg.includes("at least") || msg.includes("weak") || msg.includes("short")) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return "Could not save the password. Request a new link and try again.";
}

function bodyMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  for (const key of ["msg", "message", "error_description", "error"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * Returns a message to show, or null when the caller should say the email
 * was sent. Unknown addresses stay silent so people cannot look up accounts.
 */
export function recoverFailureMessage(status: number, body: unknown): string | null {
  const low = bodyMessage(body).toLowerCase();
  if (status === 429 || low.includes("rate limit")) {
    return "Too many emails. Wait a few minutes and try again.";
  }
  if (status >= 500) return "Could not send the email. Try again in a minute.";
  if (low.includes("redirect")) {
    return "Could not send the email. Try again from the sign-in page.";
  }
  return null;
}

export function resetRedirectUrl(base: string, next: string | null): string {
  const root = base.replace(/\/$/, "");
  const safe = safeNextPath(next);
  if (!safe) return `${root}/auth/reset`;
  return `${root}/auth/reset?next=${encodeURIComponent(safe)}`;
}

export type ResetLink =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string }
  | { kind: "otp"; tokenHash: string }
  | { kind: "invalid" }
  | { kind: "check-session" };

function paramsOf(href: string): { search: URLSearchParams; hash: URLSearchParams } | null {
  try {
    const url = new URL(href);
    return {
      search: url.searchParams,
      hash: new URLSearchParams(url.hash.replace(/^#/, "")),
    };
  } catch {
    return null;
  }
}

function first(
  search: URLSearchParams,
  hash: URLSearchParams,
  key: string,
): string | null {
  return search.get(key) || hash.get(key);
}

function readAuthLink(href: string, allowedTypes: Set<string>): ResetLink {
  const params = paramsOf(href);
  if (!params) return { kind: "invalid" };
  const { search, hash } = params;
  if (first(search, hash, "error") || first(search, hash, "error_code")) {
    return { kind: "invalid" };
  }
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const type = first(search, hash, "type");
  if (accessToken && refreshToken && type && allowedTypes.has(type)) {
    return { kind: "session", accessToken, refreshToken };
  }
  const code = search.get("code");
  if (code) return { kind: "code", code };
  const tokenHash = search.get("token_hash");
  if (tokenHash && type && allowedTypes.has(type)) return { kind: "otp", tokenHash };
  return { kind: "check-session" };
}

/** Decide how to open a password-reset link. Hash tokens work on any device. */
export function readResetLink(href: string): ResetLink {
  return readAuthLink(href, new Set(["recovery"]));
}

/** Signup confirmation links use the same token shapes as password reset. */
export function readConfirmLink(href: string): ResetLink {
  return readAuthLink(href, new Set(["signup", "email"]));
}

/** Drop the one-time credentials from the address bar. Keep a safe next path. */
export function resetPagePath(href: string): string {
  const url = new URL(href);
  url.hash = "";
  for (const key of [
    "code",
    "token_hash",
    "type",
    "error",
    "error_code",
    "error_description",
  ]) {
    url.searchParams.delete(key);
  }
  const next = safeNextPath(url.searchParams.get("next"));
  url.search = "";
  if (next) url.searchParams.set("next", next);
  return `${url.pathname}${url.search}`;
}
