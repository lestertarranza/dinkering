"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import {
  attachPlayerToExistingUser,
  parseIdentityFields,
  searchClaimPlayers as searchPlayers,
  submitAccountRequest,
  phoneInUse,
  uploadAvatar,
  validateIdentity,
} from "@/lib/accounts";
import { actionErr, actionOk, type ActionState } from "@/lib/action-state";
import { parseInviteChoice } from "@/lib/player-invite";
import { emailDomainProblem } from "@/lib/email-domain";
import { getAppBaseUrl } from "@/lib/app-url";
import { recoverFailureMessage } from "@/lib/password-reset";
import type { User } from "@supabase/supabase-js";

export async function searchClaimPlayers(q: string) {
  return searchPlayers(q);
}

function unexpectedSubmitError(err: unknown): ActionState {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("body exceeded") || msg.includes("413")) {
    return actionErr(
      "That photo is too large. Skip the photo, or pick a smaller picture.",
    );
  }
  return actionErr("Could not submit. Try again, or skip the photo.");
}

const ALREADY_HAS_LOGIN =
  "This email already has an account. Sign in with it, then claim your name. Do not create a second login.";

type PreparedLogin =
  | { userId: string; email: string; needsConfirmation: boolean }
  | { error: string };

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient();
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function signInNewLogin(email: string, password: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? "Login created. Sign in to finish your request." : null;
}

async function ensureUser(opts: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  needPassword: boolean;
}): Promise<PreparedLogin> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return { userId: user.id, email: user.email ?? opts.email, needsConfirmation: false };
  }
  if (!opts.needPassword) {
    return { error: "Sign in first, or enter a password to create a login." };
  }

  const domainProblem = await emailDomainProblem(opts.email);
  if (domainProblem) return { error: domainProblem };

  const admin = createAdminClient();
  const metadata = { first_name: opts.first_name, last_name: opts.last_name };
  const existing = await findAuthUserByEmail(opts.email);
  if (existing?.email_confirmed_at) return { error: ALREADY_HAS_LOGIN };
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: opts.password,
      email_confirm: false,
      user_metadata: metadata,
    });
    if (error) return { error: "Could not update the login. Try again." };
    return { userId: existing.id, email: opts.email, needsConfirmation: true };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: false,
    user_metadata: metadata,
  });
  if (error || !data.user) {
    const msg = (error?.message ?? "").toLowerCase();
    if (msg.includes("already")) return { error: ALREADY_HAS_LOGIN };
    return { error: "Could not create the login. Try again." };
  }
  if (data.user.email_confirmed_at) {
    const signError = await signInNewLogin(opts.email, opts.password);
    if (signError) return { error: signError };
    return { userId: data.user.id, email: opts.email, needsConfirmation: false };
  }
  return { userId: data.user.id, email: opts.email, needsConfirmation: true };
}

async function sendSignupConfirmation(email: string): Promise<string | null> {
  const base = await getAppBaseUrl();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !supabaseUrl || !anonKey) {
    return "Could not send the confirmation email. Try again in a minute.";
  }
  const url = new URL(`${supabaseUrl}/auth/v1/resend`);
  url.searchParams.set("redirect_to", `${base.replace(/\/$/, "")}/auth/confirm`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, type: "signup" }),
      cache: "no-store",
    });
    if (res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    return (
      recoverFailureMessage(res.status, body) ??
      "Could not send the confirmation email. Try again in a minute."
    );
  } catch {
    return "Could not send the confirmation email. Try again in a minute.";
  }
}

async function holdForEmailConfirmation(opts: {
  userId: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  note: string;
  photo: File | null;
  kind: "register" | "claim";
  claimed_player_id: string | null;
  invited_by_player_id: string | null;
}): Promise<ActionState> {
  const photo = await uploadAvatar(opts.userId, opts.photo);
  if (photo.error) return actionErr(photo.error);
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(opts.userId, {
    user_metadata: {
      first_name: opts.first_name,
      last_name: opts.last_name,
      signup_kind: opts.kind,
      signup_phone: opts.phone,
      signup_note: opts.note,
      signup_avatar: photo.url ?? "",
      signup_claim: opts.claimed_player_id ?? "",
      signup_invited_by: opts.invited_by_player_id ?? "",
    },
  });
  if (error) return actionErr("Could not save the registration. Try again.");
  const sendError = await sendSignupConfirmation(opts.email);
  if (sendError) return actionErr(sendError);
  return actionOk(
    "Check your email and click the link to finish.",
    "/auth/sent",
  );
}

export async function submitRegister(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    if (ctx.profile?.role === "admin") {
      return actionErr("Admins already have a login.");
    }
    if (ctx.profile?.player_id) {
      return actionOk("Already set up.", "/me");
    }
    if (ctx.pendingRequest) {
      return actionOk("Your request is still waiting.", "/pending");
    }
    if (!ctx.accountsReady) {
      return actionErr(
        "Player accounts are not enabled yet. Ask the admin to run the latest database update.",
      );
    }

    const fields = parseIdentityFields(formData);
    const needPassword = !ctx.user;
    const invalid = validateIdentity({ ...fields, needPassword });
    if (invalid) return actionErr(invalid);
    if (!fields.phone) return actionErr("Enter a valid PH mobile number.");
    if (needPassword && (await phoneInUse(fields.phone))) {
      return actionErr("This mobile number is already in use on another account.");
    }
    const invite = parseInviteChoice(String(formData.get("invited_by") || ""));
    if (!invite.invitedByPlayerId) {
      return actionErr("Pick who invited you.");
    }

    const auth = await ensureUser({
      email: fields.email,
      password: fields.password,
      first_name: fields.first_name,
      last_name: fields.last_name,
      needPassword,
    });
    if ("error" in auth) return actionErr(auth.error);
    if (auth.needsConfirmation) {
      return holdForEmailConfirmation({
        userId: auth.userId,
        email: auth.email,
        first_name: fields.first_name,
        last_name: fields.last_name,
        phone: fields.phone,
        note: fields.note,
        photo: fields.photo,
        kind: "register",
        claimed_player_id: null,
        invited_by_player_id: invite.invitedByPlayerId,
      });
    }

    const photo = await uploadAvatar(auth.userId, fields.photo);
    if (photo.error) return actionErr(photo.error);

    const result = await submitAccountRequest({
      kind: "register",
      userId: auth.userId,
      email: auth.email,
      first_name: fields.first_name,
      last_name: fields.last_name,
      phone: fields.phone,
      note: fields.note,
      avatar_url: photo.url,
      claimed_player_id: null,
      invited_by_player_id: invite.invitedByPlayerId,
    });
    if (!result.ok) return actionErr(result.error);
    return actionOk("Request sent. Waiting for admin approval.", "/pending");
  } catch (err) {
    return unexpectedSubmitError(err);
  }
}

export async function submitClaim(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await getAuthContext();
    if (ctx.profile?.player_id) {
      return actionOk("Already set up.", "/me");
    }
    if (ctx.profile?.role !== "admin" && ctx.pendingRequest) {
      return actionOk("Your request is still waiting.", "/pending");
    }
    if (!ctx.accountsReady) {
      return actionErr(
        "Player accounts are not enabled yet. Ask the admin to run the latest database update.",
      );
    }

    const fields = parseIdentityFields(formData);
    const claimed_player_id = String(formData.get("player_id") || "").trim();
    const needPassword = !ctx.user;
    const invalid = validateIdentity({ ...fields, needPassword });
    if (invalid) return actionErr(invalid);
    if (!fields.phone) return actionErr("Enter a valid PH mobile number.");
    if (needPassword && (await phoneInUse(fields.phone))) {
      return actionErr("This mobile number is already in use on another account.");
    }
    if (!claimed_player_id) {
      return actionErr("Pick the player name you want to claim.");
    }

    if (ctx.user && ctx.profile?.role === "admin") {
      const photo = await uploadAvatar(ctx.user.id, fields.photo);
      if (photo.error) return actionErr(photo.error);
      const result = await attachPlayerToExistingUser({
        userId: ctx.user.id,
        playerId: claimed_player_id,
        email: ctx.user.email ?? fields.email,
        first_name: fields.first_name,
        last_name: fields.last_name,
        phone: fields.phone,
        avatar_url: photo.url,
        reviewer: ctx.user,
        note: fields.note,
      });
      if (!result.ok) return actionErr(result.error);
      return actionOk(
        "Linked to this login.",
        result.playerToken ? `/p/${result.playerToken}` : "/admin",
      );
    }

    const auth = await ensureUser({
      email: fields.email,
      password: fields.password,
      first_name: fields.first_name,
      last_name: fields.last_name,
      needPassword,
    });
    if ("error" in auth) return actionErr(auth.error);
    if (auth.needsConfirmation) {
      return holdForEmailConfirmation({
        userId: auth.userId,
        email: auth.email,
        first_name: fields.first_name,
        last_name: fields.last_name,
        phone: fields.phone,
        note: fields.note,
        photo: fields.photo,
        kind: "claim",
        claimed_player_id,
        invited_by_player_id: null,
      });
    }

    const photo = await uploadAvatar(auth.userId, fields.photo);
    if (photo.error) return actionErr(photo.error);

    const result = await submitAccountRequest({
      kind: "claim",
      userId: auth.userId,
      email: auth.email,
      first_name: fields.first_name,
      last_name: fields.last_name,
      phone: fields.phone,
      note: fields.note,
      avatar_url: photo.url,
      claimed_player_id,
    });
    if (!result.ok) return actionErr(result.error);
    return actionOk("Request sent. Waiting for admin approval.", "/pending");
  } catch (err) {
    return unexpectedSubmitError(err);
  }
}

function metaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function finishConfirmedSignup(): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.user?.email) {
    return actionErr("This confirmation link is invalid or has expired.");
  }
  if (!ctx.user.email_confirmed_at) {
    return actionErr("Open the confirmation link from your email to finish.");
  }
  if (ctx.profile?.player_id) return actionOk("Already set up.", "/me");
  if (ctx.pendingRequest) return actionOk("Your request is still waiting.", "/pending");

  const meta = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
  const kind = metaString(meta, "signup_kind");
  if (kind !== "register" && kind !== "claim") {
    return actionOk("Signed in.", "/auth/continue");
  }

  const phone = metaString(meta, "signup_phone");
  const firstName = metaString(meta, "first_name") || ctx.profile?.first_name || "";
  const lastName = metaString(meta, "last_name") || ctx.profile?.last_name || "";
  if (!phone || !firstName || !lastName) {
    return actionErr("The registration details were missing. Submit the form again.");
  }

  const result = await submitAccountRequest({
    kind,
    userId: ctx.user.id,
    email: ctx.user.email,
    first_name: firstName,
    last_name: lastName,
    phone,
    note: metaString(meta, "signup_note"),
    avatar_url: metaString(meta, "signup_avatar") || null,
    claimed_player_id: kind === "claim" ? metaString(meta, "signup_claim") || null : null,
    invited_by_player_id: metaString(meta, "signup_invited_by") || null,
  });
  if (!result.ok) {
    if (result.error.includes("already have a request")) {
      return actionOk("Your request is still waiting.", "/pending");
    }
    return actionErr(result.error);
  }
  return actionOk("Request sent. Waiting for admin approval.", "/pending");
}
