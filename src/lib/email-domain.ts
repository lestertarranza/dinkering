import "server-only";
import { Resolver } from "node:dns/promises";
import { emailSyntaxProblem, EMAIL_DOMAIN_MESSAGE } from "@/lib/email-address";

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

async function domainHasMail(domain: string): Promise<"yes" | "no" | "unknown"> {
  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.length > 0) return "yes";
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") {
      try {
        await resolver.resolve4(domain);
        return "yes";
      } catch (inner) {
        const innerCode =
          inner && typeof inner === "object" && "code" in inner ? String(inner.code) : "";
        if (innerCode === "ENOTFOUND" || innerCode === "ENODATA" || innerCode === "ESERVFAIL") {
          return "no";
        }
        return "unknown";
      }
    }
    return "unknown";
  }
  try {
    await resolver.resolve4(domain);
    return "yes";
  } catch {
    return "no";
  }
}

/**
 * Syntax and mail-server check. A DNS timeout does not block registration;
 * the confirmation email is the real delivery test.
 */
export async function emailDomainProblem(email: string): Promise<string | null> {
  const syntax = emailSyntaxProblem(email);
  if (syntax) return syntax;
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const mail = await domainHasMail(domain);
  if (mail === "no") return EMAIL_DOMAIN_MESSAGE;
  return null;
}
