import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Require a signed-in admin for server actions and API routes. */
export async function requireAdmin(): Promise<{
  supabase: SupabaseClient;
  user: User;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return { supabase, user };
}
