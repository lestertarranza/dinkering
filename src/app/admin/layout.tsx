import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { AdminHotkeys } from "@/components/AdminHotkeys";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminNav email={user.email ?? null} />
      <AdminHotkeys />
      <main className="flex-1 overflow-x-hidden px-4 py-5 pb-24 sm:px-6 lg:px-8 md:pb-5">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
