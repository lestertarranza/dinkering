"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth";
import {
  attachPlayerToExistingUser,
  parseIdentityFields,
  searchClaimPlayers as searchPlayers,
  submitAccountRequest,
  uploadAvatar,
  validateIdentity,
} from "@/lib/accounts";
import { actionErr, type ActionState } from "@/lib/action-state";
import { parseInviteChoice } from "@/lib/player-invite";

export async function searchClaimPlayers(q: string) {
  return searchPlayers(q);
}

async function ensureUser(opts: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  needPassword: boolean;
}): Promise<{ userId: string; email: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return { userId: user.id, email: user.email ?? opts.email };
  }
  if (!opts.needPassword) {
    return { error: "Sign in first, or enter a password to create a login." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
    user_metadata: {
      first_name: opts.first_name,
      last_name: opts.last_name,
    },
  });
  if (error || !data.user) {
    const msg = (error?.message ?? "").toLowerCase();
    if (msg.includes("already")) {
      return {
        error:
          "This email already has an account. Sign in with it, then claim your name. Do not create a second login.",
      };
    }
    return { error: "Could not create the login. Try again." };
  }
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  if (signErr) {
    return { error: "Login created. Sign in to finish your request." };
  }
  return { userId: data.user.id, email: opts.email };
}

export async function submitRegister(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (ctx.profile?.role === "admin") {
    return actionErr("Admins already have a login.");
  }
  if (ctx.profile?.player_id) {
    redirect("/me");
  }
  if (ctx.pendingRequest) {
    redirect("/pending");
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
  redirect("/pending");
}

export async function submitClaim(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (ctx.profile?.player_id) {
    redirect("/me");
  }
  if (ctx.profile?.role !== "admin" && ctx.pendingRequest) {
    redirect("/pending");
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
    redirect(result.playerToken ? `/p/${result.playerToken}` : "/admin");
  }

  const auth = await ensureUser({
    email: fields.email,
    password: fields.password,
    first_name: fields.first_name,
    last_name: fields.last_name,
    needPassword,
  });
  if ("error" in auth) return actionErr(auth.error);

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
  redirect("/pending");
}
