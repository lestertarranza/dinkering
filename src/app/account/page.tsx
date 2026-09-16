import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass, buttonClass, Card } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SignOutButton } from "@/components/SignOutButton";
import { saveAccount } from "./actions";
import { formatPhMobile } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login?next=/account");
  if (ctx.profile?.role === "admin") redirect("/admin");
  if (ctx.pendingRequest) redirect("/pending");
  if (!ctx.profile?.player_id || !ctx.playerToken) redirect("/register");

  const p = ctx.profile;

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">My account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Phone and photo are used so the admin can recognize you.
        </p>
      </div>
      <Card className="p-6">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.avatar_url}
            alt=""
            className="mx-auto mb-4 h-24 w-24 rounded-full object-cover"
          />
        ) : null}
        <ActionForm action={saveAccount} className="space-y-4" pendingLabel="Saving…">
          <Field label="First name">
            <input
              name="first_name"
              required
              defaultValue={p.first_name}
              className={inputClass}
            />
          </Field>
          <Field label="Last name">
            <input
              name="last_name"
              required
              defaultValue={p.last_name}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              value={ctx.user.email ?? ""}
              readOnly
              className={`${inputClass} bg-slate-50 text-slate-500`}
            />
          </Field>
          <Field label="Mobile number" hint="PH mobile, like 0917 123 4567.">
            <input
              name="phone"
              type="tel"
              required
              defaultValue={formatPhMobile(p.phone)}
              className={inputClass}
            />
          </Field>
          <Field label="Photo (optional)" hint="JPG, PNG, or WebP, up to 2 MB.">
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-800"
            />
          </Field>
          <SubmitButton className="w-full" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </ActionForm>
      </Card>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={`/p/${ctx.playerToken}`} className={buttonClass("secondary")}>
          My player page
        </Link>
        <SignOutButton />
      </div>
    </main>
  );
}
