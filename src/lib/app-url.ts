import { headers } from "next/headers";

/**
 * Absolute base URL for building shareable links (e.g. player/group portals).
 *
 * Prefers the actual request host so links always point at the real domain the
 * app is being served from — this avoids stale/wrong values baked into
 * NEXT_PUBLIC_APP_URL at build time (which is how "localhost" ended up in
 * copied summaries). Falls back to the env var when no request is available.
 */
export async function getAppBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const proto = h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() is unavailable outside a request scope — fall back to env.
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}
