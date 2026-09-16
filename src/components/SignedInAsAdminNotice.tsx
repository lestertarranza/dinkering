import { SignOutButton } from "@/components/SignOutButton";

export function SignedInAsAdminNotice({ stayHref }: { stayHref: string }) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>
        You are signed in as an admin. Sign out first if you want to try this as
        a new player.
      </p>
      <div className="mt-2">
        <SignOutButton label="Sign out" redirectTo={stayHref} />
      </div>
    </div>
  );
}
