import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { buttonClass } from "@/components/ui";

export default function SignupEmailSentPage() {
  return (
    <AuthShell
      title="Check your email"
      subtitle="The request is not sent until you open the link."
    >
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-700">
          We sent a confirmation link. Open it on this phone or any other
          device. If it does not arrive, check the spelling and submit the form
          again.
        </p>
        <Link href="/register" className={buttonClass("secondary", "w-full")}>
          Back to registration
        </Link>
      </div>
    </AuthShell>
  );
}
