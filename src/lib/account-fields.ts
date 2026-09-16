export const MIN_PASSWORD_LENGTH = 8;
export const MIN_CLAIM_SEARCH = 2;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function playerFullName(first: string, last: string): string {
  return `${first.trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
}

export function sanitizeSearch(raw: string): string {
  return raw
    .trim()
    .replace(/[%_,*()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Relative in-app path only. Blocks protocol-relative and absolute URLs. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("://") || raw.includes("\\")) return null;
  return raw;
}

export function isMissingRelation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

export function postLoginPath(opts: {
  role?: string | null;
  playerToken?: string | null;
  pending: boolean;
  next: string | null;
}): string {
  if (opts.role === "admin") {
    const n = opts.next;
    if (n && (n === "/admin" || n.startsWith("/admin/"))) return n;
    if (n && n.startsWith("/") && !n.startsWith("/admin")) {
      // Admins may follow a non-admin next (e.g. a player page).
      return n;
    }
    return "/admin";
  }
  if (opts.playerToken) return `/p/${opts.playerToken}`;
  if (opts.pending) return "/pending";
  return "/register";
}

export function photoExtension(contentType: string): "jpg" | "png" | "webp" {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export type ClaimSearchHit = {
  id: string;
  name: string;
  display_name: string | null;
  pending: boolean;
};
