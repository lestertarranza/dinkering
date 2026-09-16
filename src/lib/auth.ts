import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountRequest, UserProfile } from "@/lib/types";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type AuthContext = {
  supabase: SupabaseClient;
  user: User | null;
  profile: UserProfile | null;
  pendingRequest: AccountRequest | null;
  latestRequest: AccountRequest | null;
  playerToken: string | null;
  accountsReady: boolean;
};

let accountsReadyCache: boolean | undefined;

export async function getAccountsReady(): Promise<boolean> {
  if (accountsReadyCache === true) return true;
  const admin = createAdminClient();
  const { error } = await admin.from("user_profiles").select("id").limit(1);
  if (error) return false;
  accountsReadyCache = true;
  return true;
}

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountsReady = await getAccountsReady();
  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
      pendingRequest: null,
      latestRequest: null,
      playerToken: null,
      accountsReady,
    };
  }

  if (!accountsReady) {
    return {
      supabase,
      user,
      profile: null,
      pendingRequest: null,
      latestRequest: null,
      playerToken: null,
      accountsReady,
    };
  }

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const profile = (profileRow as UserProfile | null) ?? null;

  const { data: requests } = await supabase
    .from("account_requests")
    .select("*")
    .eq("auth_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const list = (requests ?? []) as AccountRequest[];
  const pendingRequest = list.find((r) => r.status === "pending") ?? null;
  const latestRequest = list[0] ?? null;

  let playerToken: string | null = null;
  if (profile?.player_id) {
    const admin = createAdminClient();
    const { data: player } = await admin
      .from("players")
      .select("public_token")
      .eq("id", profile.player_id)
      .maybeSingle();
    playerToken = (player?.public_token as string | undefined) ?? null;
  }

  return {
    supabase,
    user,
    profile,
    pendingRequest,
    latestRequest,
    playerToken,
    accountsReady,
  };
}

/**
 * Require a signed-in admin for server actions and API routes.
 * Before migration 0020, any signed-in user is treated as admin (legacy).
 * After 0020, only user_profiles.role = admin.
 */
export async function requireAdmin(): Promise<{
  supabase: SupabaseClient;
  user: User;
}> {
  const ctx = await getAuthContext();
  if (!ctx.user) throw new UnauthorizedError();
  if (!ctx.accountsReady) return { supabase: ctx.supabase, user: ctx.user };
  if (ctx.profile?.role !== "admin") throw new UnauthorizedError();
  return { supabase: ctx.supabase, user: ctx.user };
}

export async function requireSignedIn(): Promise<{
  supabase: SupabaseClient;
  user: User;
  profile: UserProfile | null;
  accountsReady: boolean;
}> {
  const ctx = await getAuthContext();
  if (!ctx.user) throw new UnauthorizedError();
  return {
    supabase: ctx.supabase,
    user: ctx.user,
    profile: ctx.profile,
    accountsReady: ctx.accountsReady,
  };
}
