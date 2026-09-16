/** Philippine mobile numbers. Stored as +639XXXXXXXXX. */

export function normalizePhMobile(raw: string): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("63")) {
    const rest = s.slice(2);
    if (/^9\d{9}$/.test(rest)) return `+63${rest}`;
    return null;
  }
  if (/^09\d{9}$/.test(s)) return `+63${s.slice(1)}`;
  if (/^9\d{9}$/.test(s)) return `+63${s}`;
  return null;
}

export function formatPhMobile(e164: string | null | undefined): string {
  if (!e164) return "";
  const n = normalizePhMobile(e164);
  if (!n) return e164;
  const local = n.slice(3); // 9XXXXXXXXX
  return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
