"use client";

import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveAccount } from "@/app/account/actions";
import { prepareAvatarField } from "@/lib/image-compress";

export function AccountSettingsForm({
  firstName,
  lastName,
  email,
  phone,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
}) {
  return (
    <>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="mx-auto mb-4 h-24 w-24 rounded-full object-cover"
        />
      ) : null}
      <ActionForm
        action={saveAccount}
        className="space-y-4"
        pendingLabel="Saving…"
        prepare={prepareAvatarField}
      >
        <Field label="First name">
          <input
            name="first_name"
            required
            defaultValue={firstName}
            className={inputClass}
          />
        </Field>
        <Field label="Last name">
          <input
            name="last_name"
            required
            defaultValue={lastName}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            value={email}
            readOnly
            className={`${inputClass} bg-slate-50 text-slate-500`}
          />
        </Field>
        <Field label="Mobile number" hint="PH mobile, like 0917 123 4567.">
          <input
            name="phone"
            type="tel"
            required
            defaultValue={phone}
            className={inputClass}
          />
        </Field>
        <Field
          label="Photo (optional)"
          hint="We shrink it on your phone. Skip it if you hit an error."
        >
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-emerald-800"
          />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </ActionForm>
    </>
  );
}
