import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrollPlayerInUpcomingBookings } from "@/lib/roster-enroll";
import { logAdminAction } from "@/lib/activity-log";
import { formatPhMobile, normalizePhMobile } from "@/lib/phone";
import {
  MAX_PHOTO_BYTES,
  MIN_CLAIM_SEARCH,
  MIN_PASSWORD_LENGTH,
  PHOTO_TYPES,
  isMissingRelation,
  photoExtension,
  playerFullName,
  sanitizeSearch,
  type ClaimSearchHit,
} from "@/lib/account-fields";
import type { User } from "@supabase/supabase-js";
import type {
  AccountRequest,
  AccountRequestKind,
  Player,
  UserProfile,
} from "@/lib/types";

export type AccountFormResult =
  | { ok: true; playerToken?: string }
  | { ok: false; error: string };

function uniqueViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505";
}

export async function uploadAvatar(
  userId: string,
  file: File | null | undefined,
): Promise<{ url: string | null; error?: string }> {
  if (!file || file.size === 0) return { url: null };
  if (file.size > MAX_PHOTO_BYTES) {
    return { url: null, error: "Photo must be 2 MB or smaller." };
  }
  const type = file.type || "image/jpeg";
  if (!PHOTO_TYPES.has(type)) {
    return { url: null, error: "Use a JPG, PNG, or WebP photo." };
  }
  const ext = photoExtension(type);
  const path = `${userId}/avatar.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();
  const { error } = await admin.storage.from("avatars").upload(path, buf, {
    contentType: type,
    upsert: true,
  });
  if (error) return { url: null, error: "Could not save the photo. Try again." };
  const { data } = admin.storage.from("avatars").getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function phoneInUse(
  phone: string,
  exceptUserId?: string,
): Promise<boolean> {
  const admin = createAdminClient();
  let profileQuery = admin
    .from("user_profiles")
    .select("id")
    .eq("phone", phone);
  if (exceptUserId) profileQuery = profileQuery.neq("id", exceptUserId);
  const { data: profile } = await profileQuery.maybeSingle();
  if (profile) return true;

  let pendingQuery = admin
    .from("account_requests")
    .select("id")
    .eq("phone", phone)
    .eq("status", "pending");
  if (exceptUserId) pendingQuery = pendingQuery.neq("auth_user_id", exceptUserId);
  const { data: pending } = await pendingQuery.maybeSingle();
  return !!pending;
}

export function parseIdentityFields(formData: FormData): {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  password: string;
  confirm: string;
  note: string;
  photo: File | null;
} {
  const photoRaw = formData.get("photo");
  const photo =
    photoRaw instanceof File && photoRaw.size > 0 ? photoRaw : null;
  return {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim(),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    phone: normalizePhMobile(String(formData.get("phone") || "")),
    password: String(formData.get("password") || ""),
    confirm: String(formData.get("confirm") || ""),
    note: String(formData.get("note") || "").trim(),
    photo,
  };
}

export function validateIdentity(opts: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  password: string;
  confirm: string;
  needPassword: boolean;
}): string | null {
  if (!opts.first_name || !opts.last_name) {
    return "Enter your first and last name.";
  }
  if (!opts.email || !opts.email.includes("@")) {
    return "Enter a valid email.";
  }
  if (!opts.phone) {
    return "Enter a valid PH mobile number, like 0917 123 4567.";
  }
  if (opts.needPassword) {
    if (opts.password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (opts.password !== opts.confirm) {
      return "Password and confirmation do not match.";
    }
  }
  return null;
}

export async function attachPlayerToExistingUser(opts: {
  userId: string;
  playerId: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  reviewer: User;
  note?: string;
}): Promise<AccountFormResult> {
  const admin = createAdminClient();
  const { data: player } = await admin
    .from("players")
    .select("id, public_token, active_status")
    .eq("id", opts.playerId)
    .maybeSingle();
  if (!player || player.active_status === "archived") {
    return { ok: false, error: "That player name is not available." };
  }

  const { data: linked } = await admin
    .from("user_profiles")
    .select("id")
    .eq("player_id", opts.playerId)
    .maybeSingle();
  if (linked && linked.id !== opts.userId) {
    return { ok: false, error: "That name already has a login." };
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, role, player_id, phone, avatar_url, first_name, last_name")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!profile) {
    return { ok: false, error: "Could not find this login." };
  }
  if (profile.player_id && profile.player_id !== opts.playerId) {
    return { ok: false, error: "This login is already linked to a different player." };
  }

  if (opts.phone && (await phoneInUse(opts.phone, opts.userId))) {
    return {
      ok: false,
      error: "This mobile number is already in use on another account.",
    };
  }

  const { error: linkErr } = await admin
    .from("user_profiles")
    .update({
      player_id: opts.playerId,
      first_name: opts.first_name || profile.first_name,
      last_name: opts.last_name || profile.last_name,
      phone: opts.phone || profile.phone,
      avatar_url: opts.avatar_url || profile.avatar_url,
    })
    .eq("id", opts.userId);
  if (linkErr) {
    if (uniqueViolation(linkErr)) {
      return {
        ok: false,
        error: "Phone or player is already linked to another login.",
      };
    }
    return { ok: false, error: "Could not link the login." };
  }

  await admin.from("account_requests").insert({
    kind: "claim",
    status: "approved",
    auth_user_id: opts.userId,
    email: opts.email,
    phone: opts.phone || profile.phone || "-",
    first_name: opts.first_name || profile.first_name || "",
    last_name: opts.last_name || profile.last_name || "",
    avatar_url: opts.avatar_url || profile.avatar_url,
    claimed_player_id: opts.playerId,
    note: opts.note || "Linked existing login",
    reviewed_by: opts.reviewer.id,
    reviewed_at: new Date().toISOString(),
  });

  await logAdminAction(admin, opts.reviewer, {
    entityType: "player",
    entityId: opts.playerId,
    action: `Linked login to player: ${opts.email}`,
    details: opts.phone ? formatPhMobile(opts.phone) : null,
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${opts.playerId}`);
  revalidatePath("/claim");
  return { ok: true, playerToken: player.public_token as string };
}

export async function submitAccountRequest(opts: {
  kind: AccountRequestKind;
  userId: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  note: string;
  avatar_url: string | null;
  claimed_player_id: string | null;
}): Promise<AccountFormResult> {
  const admin = createAdminClient();

  if (await phoneInUse(opts.phone, opts.userId)) {
    return {
      ok: false,
      error: "This mobile number is already in use on another account.",
    };
  }

  if (opts.kind === "claim") {
    if (!opts.claimed_player_id) {
      return { ok: false, error: "Pick the player name you want to claim." };
    }
    const { data: player } = await admin
      .from("players")
      .select("id, active_status")
      .eq("id", opts.claimed_player_id)
      .maybeSingle();
    if (!player || player.active_status === "archived") {
      return { ok: false, error: "That player name is not available." };
    }
    const { data: linked } = await admin
      .from("user_profiles")
      .select("id")
      .eq("player_id", opts.claimed_player_id)
      .maybeSingle();
    if (linked) {
      return {
        ok: false,
        error: "That name already has a login. Sign in instead.",
      };
    }
    const { data: pendingClaim } = await admin
      .from("account_requests")
      .select("id")
      .eq("claimed_player_id", opts.claimed_player_id)
      .eq("status", "pending")
      .maybeSingle();
    if (pendingClaim) {
      return {
        ok: false,
        error: "Someone already asked to claim this name. Wait for the admin, or pick another name.",
      };
    }
  }

  const { data: existingPending } = await admin
    .from("account_requests")
    .select("id")
    .eq("auth_user_id", opts.userId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    return {
      ok: false,
      error: "You already have a request waiting for approval.",
    };
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("player_id, role")
    .eq("id", opts.userId)
    .maybeSingle();
  if (profile?.role === "admin") {
    return {
      ok: false,
      error:
        "This admin login can claim a name immediately. Stay signed in and use Claim, or link it from the player page in admin.",
    };
  }
  if (profile?.player_id) {
    return { ok: false, error: "This login is already linked to a player." };
  }

  const { error: profileErr } = await admin.from("user_profiles").upsert(
    {
      id: opts.userId,
      role: "player",
      first_name: opts.first_name,
      last_name: opts.last_name,
      phone: opts.phone,
      avatar_url: opts.avatar_url,
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    if (uniqueViolation(profileErr)) {
      return {
        ok: false,
        error: "This mobile number is already in use on another account.",
      };
    }
    return { ok: false, error: "Could not save your profile. Try again." };
  }

  const { error } = await admin.from("account_requests").insert({
    kind: opts.kind,
    status: "pending",
    auth_user_id: opts.userId,
    email: opts.email,
    phone: opts.phone,
    first_name: opts.first_name,
    last_name: opts.last_name,
    avatar_url: opts.avatar_url,
    claimed_player_id: opts.kind === "claim" ? opts.claimed_player_id : null,
    note: opts.note || null,
  });
  if (error) {
    if (uniqueViolation(error)) {
      return {
        ok: false,
        error: "This email, mobile number, or name already has a pending request.",
      };
    }
    if (isMissingRelation(error)) {
      return {
        ok: false,
        error: "Player accounts are not enabled yet. Ask the admin to run the latest database update.",
      };
    }
    return { ok: false, error: "Could not submit the request. Try again." };
  }

  revalidatePath("/admin/approvals");
  revalidatePath("/pending");
  return { ok: true };
}

export async function searchClaimPlayers(raw: string): Promise<{
  players: ClaimSearchHit[];
  error?: string;
}> {
  const q = sanitizeSearch(raw);
  if (q.length < MIN_CLAIM_SEARCH) return { players: [] };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("players")
    .select("id, name, display_name")
    .neq("active_status", "archived")
    .or(`name.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order("name")
    .limit(8);
  if (error) {
    if (isMissingRelation(error)) {
      return {
        players: [],
        error: "Player accounts are not enabled yet.",
      };
    }
    return { players: [], error: "Search failed. Try again." };
  }
  const rows = (data ?? []) as Pick<Player, "id" | "name" | "display_name">[];
  if (rows.length === 0) return { players: [] };

  const ids = rows.map((r) => r.id);
  const [{ data: linked }, { data: pending }] = await Promise.all([
    admin.from("user_profiles").select("player_id").in("player_id", ids),
    admin
      .from("account_requests")
      .select("claimed_player_id")
      .eq("status", "pending")
      .in("claimed_player_id", ids),
  ]);
  const linkedIds = new Set(
    (linked ?? []).map((r) => r.player_id as string).filter(Boolean),
  );
  const pendingIds = new Set(
    (pending ?? [])
      .map((r) => r.claimed_player_id as string)
      .filter(Boolean),
  );
  return {
    players: rows
      .filter((r) => !linkedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        display_name: r.display_name,
        pending: pendingIds.has(r.id),
      })),
  };
}

export async function getPlayerLink(playerId: string): Promise<{
  linked: boolean;
  pendingClaim: boolean;
  avatarUrl: string | null;
  profileId: string | null;
}> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("id, avatar_url")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error && isMissingRelation(error)) {
    return { linked: false, pendingClaim: false, avatarUrl: null, profileId: null };
  }
  const { data: pending } = await admin
    .from("account_requests")
    .select("id")
    .eq("claimed_player_id", playerId)
    .eq("status", "pending")
    .maybeSingle();
  return {
    linked: !!profile,
    pendingClaim: !!pending,
    avatarUrl: (profile?.avatar_url as string | null) ?? null,
    profileId: (profile?.id as string | null) ?? null,
  };
}

export async function listPendingRequests(): Promise<
  (AccountRequest & { player_name: string | null })[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("account_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as AccountRequest[];
  const claimIds = rows
    .map((r) => r.claimed_player_id)
    .filter((id): id is string => !!id);
  const names = new Map<string, string>();
  if (claimIds.length > 0) {
    const { data: players } = await admin
      .from("players")
      .select("id, name, display_name")
      .in("id", claimIds);
    for (const p of players ?? []) {
      names.set(
        p.id as string,
        ((p.display_name as string | null)?.trim() || (p.name as string)) ?? "",
      );
    }
  }
  return rows.map((r) => ({
    ...r,
    player_name: r.claimed_player_id
      ? names.get(r.claimed_player_id) ?? "Unknown player"
      : null,
  }));
}

export async function recentRsvpsForPlayer(playerId: string): Promise<
  { label: string; status: string }[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("booking_attendance")
    .select("response_status, bookings(play_date, booking_code, venue, status)")
    .eq("player_id", playerId)
    .limit(30);
  const rows = (data ?? []) as unknown as {
    response_status: string;
    bookings: {
      play_date: string;
      booking_code: string | null;
      venue: string | null;
      status: string;
    } | {
      play_date: string;
      booking_code: string | null;
      venue: string | null;
      status: string;
    }[] | null;
  }[];
  return rows
    .map((r) => ({
      response_status: r.response_status,
      bookings: Array.isArray(r.bookings) ? r.bookings[0] ?? null : r.bookings,
    }))
    .filter((r) => r.bookings)
    .sort((a, b) =>
      (b.bookings?.play_date ?? "").localeCompare(a.bookings?.play_date ?? ""),
    )
    .slice(0, 5)
    .map((r) => {
      const b = r.bookings!;
      const code = b.booking_code?.trim() || b.play_date;
      const venue = b.venue ? ` · ${b.venue}` : "";
      return { label: `${code}${venue}`, status: r.response_status };
    });
}

export async function approveAccountRequest(
  requestId: string,
  reviewer: User,
): Promise<AccountFormResult> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("account_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  const req = row as AccountRequest | null;
  if (!req || req.status !== "pending") {
    return { ok: false, error: "This request is no longer pending." };
  }

  if (await phoneInUse(req.phone, req.auth_user_id)) {
    return {
      ok: false,
      error: "This mobile number is already used on an approved account.",
    };
  }

  let playerId = req.claimed_player_id;
  if (req.kind === "register") {
    const name = playerFullName(req.first_name, req.last_name);
    const { data: created, error } = await admin
      .from("players")
      .insert({
        name,
        display_name: req.first_name,
        active_status: "active",
        notes: `Registered by ${req.email}`,
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: "Could not create the player." };
    }
    playerId = created.id as string;
    await enrollPlayerInUpcomingBookings(admin, playerId);
  } else {
    if (!playerId) return { ok: false, error: "This claim has no player." };
    const { data: linked } = await admin
      .from("user_profiles")
      .select("id")
      .eq("player_id", playerId)
      .maybeSingle();
    if (linked && linked.id !== req.auth_user_id) {
      return { ok: false, error: "That player is already linked to a login." };
    }
  }

  const { error: linkErr } = await admin
    .from("user_profiles")
    .update({
      player_id: playerId,
      first_name: req.first_name,
      last_name: req.last_name,
      phone: req.phone,
      avatar_url: req.avatar_url,
    })
    .eq("id", req.auth_user_id);
  if (linkErr) {
    if (uniqueViolation(linkErr)) {
      return {
        ok: false,
        error: "Phone or player is already linked to another login.",
      };
    }
    return { ok: false, error: "Could not link the login." };
  }

  await admin
    .from("account_requests")
    .update({
      status: "approved",
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  await logAdminAction(admin, reviewer, {
    entityType: "player",
    entityId: playerId,
    action:
      req.kind === "register"
        ? `Approved registration: ${playerFullName(req.first_name, req.last_name)}`
        : `Approved claim: ${req.email}`,
    details: formatPhMobile(req.phone),
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/admin/players");
  if (playerId) revalidatePath(`/admin/players/${playerId}`);
  revalidatePath("/pending");
  return { ok: true };
}

export async function rejectAccountRequest(
  requestId: string,
  reviewer: User,
  reason: string,
): Promise<AccountFormResult> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("account_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  const req = row as AccountRequest | null;
  if (!req || req.status !== "pending") {
    return { ok: false, error: "This request is no longer pending." };
  }
  await admin
    .from("account_requests")
    .update({
      status: "rejected",
      reject_reason: reason.trim() || null,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  await admin
    .from("user_profiles")
    .update({ phone: null })
    .eq("id", req.auth_user_id)
    .is("player_id", null);

  await logAdminAction(admin, reviewer, {
    entityType: "player",
    entityId: req.claimed_player_id,
    action: `Rejected ${req.kind}: ${req.email}`,
    details: reason.trim() || null,
  });

  revalidatePath("/admin/approvals");
  revalidatePath("/pending");
  return { ok: true };
}

export async function updateOwnProfile(opts: {
  userId: string;
  phone: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}): Promise<AccountFormResult> {
  const admin = createAdminClient();
  if (await phoneInUse(opts.phone, opts.userId)) {
    return {
      ok: false,
      error: "This mobile number is already in use on another account.",
    };
  }
  const { data: current } = await admin
    .from("user_profiles")
    .select("*")
    .eq("id", opts.userId)
    .maybeSingle();
  const profile = current as UserProfile | null;
  if (!profile?.player_id) {
    return { ok: false, error: "Your login is not linked to a player yet." };
  }
  const { error } = await admin
    .from("user_profiles")
    .update({
      phone: opts.phone,
      first_name: opts.first_name,
      last_name: opts.last_name,
      avatar_url: opts.avatar_url ?? profile.avatar_url,
    })
    .eq("id", opts.userId);
  if (error) {
    if (uniqueViolation(error)) {
      return {
        ok: false,
        error: "This mobile number is already in use on another account.",
      };
    }
    return { ok: false, error: "Could not save your account." };
  }
  revalidatePath("/account");
  return { ok: true };
}

export async function playerLinkMap(): Promise<{
  linked: Map<string, string>;
  pendingClaims: Set<string>;
}> {
  const admin = createAdminClient();
  const linked = new Map<string, string>();
  const pendingClaims = new Set<string>();
  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id, player_id")
    .not("player_id", "is", null);
  if (error && isMissingRelation(error)) {
    return { linked, pendingClaims };
  }
  for (const row of profiles ?? []) {
    if (row.player_id) linked.set(row.player_id as string, row.id as string);
  }
  const { data: pending } = await admin
    .from("account_requests")
    .select("claimed_player_id")
    .eq("status", "pending")
    .not("claimed_player_id", "is", null);
  for (const row of pending ?? []) {
    if (row.claimed_player_id) pendingClaims.add(row.claimed_player_id as string);
  }
  return { linked, pendingClaims };
}

export async function pendingRequestCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("account_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export async function linkedAccountForPlayer(playerId: string): Promise<{
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  first_name: string;
  last_name: string;
} | null> {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("*")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error || !profile) return null;
  const { data: user } = await admin.auth.admin.getUserById(profile.id as string);
  return {
    email: user.user?.email ?? null,
    phone: (profile.phone as string | null) ?? null,
    avatar_url: (profile.avatar_url as string | null) ?? null,
    first_name: (profile.first_name as string) ?? "",
    last_name: (profile.last_name as string) ?? "",
  };
}
