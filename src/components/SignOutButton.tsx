"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui";

export function SignOutButton({
  label = "Sign out",
  redirectTo = "/login",
}: {
  label?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={buttonClass("ghost")}
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push(redirectTo);
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
