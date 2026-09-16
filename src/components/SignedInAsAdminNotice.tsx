import { SignOutButton } from "@/components/SignOutButton";

export function SignedInAsAdminNotice({
  stayHref,
  mode = "register",
}: {
  stayHref: string;
  mode?: "register" | "claim";
}) {
  if (mode === "claim") {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p>
          Stay signed in. This attaches the name you pick to this admin login.
          You keep admin access. Do not sign out and try to create a second
          account with the same email.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        You are signed in as an admin. Sign out first if you want to register a
        new person with a different email.
      </p>
      <div className="mt-2">
        <SignOutButton label="Sign out" redirectTo={stayHref} />
      </div>
    </div>
  );
}
