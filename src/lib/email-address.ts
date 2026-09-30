import { normalizeLoginEmail } from "@/lib/password-reset";

const TYPO_TLDS = new Set([
  "con",
  "cmo",
  "comm",
  "coom",
  "vom",
  "xom",
  "ocm",
  "cim",
  "ney",
]);

const TYPO_DOMAINS = new Set([
  "gmal.com",
  "gmial.com",
  "gamil.com",
  "gnail.com",
  "gmail.co",
  "gmail.cm",
  "gmail.con",
  "gmai.com",
  "yahooo.com",
  "yaho.com",
  "hotmal.com",
  "hotmial.com",
]);

export const EMAIL_SYNTAX_MESSAGE =
  "That email does not look right. Check the spelling, especially the part after @.";

export const EMAIL_DOMAIN_MESSAGE =
  "That email domain cannot receive mail. Check the spelling.";

/** Reject missing domains and common typos like gmail.con before any email is sent. */
export function emailSyntaxProblem(email: string): string | null {
  const cleaned = normalizeLoginEmail(email);
  if (!cleaned) return EMAIL_SYNTAX_MESSAGE;
  const domain = cleaned.split("@")[1] ?? "";
  const tld = domain.split(".").at(-1) ?? "";
  if (TYPO_DOMAINS.has(domain) || TYPO_TLDS.has(tld)) return EMAIL_SYNTAX_MESSAGE;
  return null;
}
