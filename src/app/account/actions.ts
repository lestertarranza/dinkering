"use server";

import { getAuthContext } from "@/lib/auth";
import { updateOwnProfile, uploadAvatar } from "@/lib/accounts";
import { actionErr, actionOk, type ActionState } from "@/lib/action-state";
import { normalizePhMobile } from "@/lib/phone";

export async function saveAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.user || !ctx.profile?.player_id) {
    return actionErr("Sign in with a linked player account to edit this.");
  }
  const first_name = String(formData.get("first_name") || "").trim();
  const last_name = String(formData.get("last_name") || "").trim();
  const phone = normalizePhMobile(String(formData.get("phone") || ""));
  if (!first_name || !last_name) {
    return actionErr("Enter your first and last name.");
  }
  if (!phone) {
    return actionErr("Enter a valid PH mobile number, like 0917 123 4567.");
  }

  const photoRaw = formData.get("photo");
  const photo = photoRaw instanceof File && photoRaw.size > 0 ? photoRaw : null;
  let avatar_url: string | null = ctx.profile.avatar_url;
  if (photo) {
    const uploaded = await uploadAvatar(ctx.user.id, photo);
    if (uploaded.error) return actionErr(uploaded.error);
    avatar_url = uploaded.url ?? avatar_url;
  }

  const result = await updateOwnProfile({
    userId: ctx.user.id,
    phone,
    first_name,
    last_name,
    avatar_url,
  });
  if (!result.ok) return actionErr(result.error);
  return actionOk("Saved.");
}
