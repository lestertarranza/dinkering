"use client";

import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { InviteSelect } from "@/components/InviteSelect";
import type { FormAction } from "@/lib/action-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/account-fields";
import { prepareAvatarField } from "@/lib/image-compress";

export function AccountRequestForm({
  action,
  kind,
  playerId,
  playerLabel,
  defaultEmail,
  needPassword,
  submitLabel,
  inviteOptions,
}: {
  action: FormAction;
  kind: "register" | "claim";
  playerId?: string;
  playerLabel?: string;
  defaultEmail?: string;
  needPassword: boolean;
  submitLabel: string;
  inviteOptions?: { id: string; label: string }[];
}) {
  return (
    <ActionForm
      action={action}
      className="space-y-4"
      pendingLabel="Submitting…"
      prepare={prepareAvatarField}
    >
      {playerId ? <input type="hidden" name="player_id" value={playerId} /> : null}
      {kind === "claim" && playerLabel ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Claiming <span className="font-semibold">{playerLabel}</span>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <input name="first_name" required autoComplete="given-name" className={inputClass} />
        </Field>
        <Field label="Last name">
          <input name="last_name" required autoComplete="family-name" className={inputClass} />
        </Field>
      </div>
      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail ?? ""}
          readOnly={!!defaultEmail}
          className={inputClass}
        />
      </Field>
      <Field
        label="Mobile number"
        hint="PH mobile, like 0917 123 4567."
      >
        <input
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          className={inputClass}
          placeholder="0917 123 4567"
        />
      </Field>
      {kind === "register" && inviteOptions ? (
        <InviteSelect
          options={inviteOptions}
          required
          allowUnset={false}
        />
      ) : null}
      {needPassword ? (
        <>
          <Field
            label="Password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters. This is how you sign in.`}
          >
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              className={inputClass}
            />
          </Field>
          <Field label="Confirm password">
            <input
              name="confirm"
              type="password"
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              className={inputClass}
            />
          </Field>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          You are signed in. This request will use your current login.
        </p>
      )}
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
      <Field label="Note for the admin (optional)">
        <textarea name="note" rows={2} className={inputClass} />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Submitting…">
        {submitLabel}
      </SubmitButton>
      <p className="text-center text-xs text-slate-400">
        {kind === "register" ? (
          <>
            Already on the team?{" "}
            <Link href="/claim" className="font-medium text-emerald-700">
              Claim your name
            </Link>
            .
          </>
        ) : (
          <>
            Not on the list yet?{" "}
            <Link href="/register" className="font-medium text-emerald-700">
              Register as new
            </Link>
            .
          </>
        )}
      </p>
      <p className="text-center text-xs text-slate-400">
        <Link href="/login" className={buttonClass("ghost", "text-xs")}>
          Sign in
        </Link>
      </p>
    </ActionForm>
  );
}
