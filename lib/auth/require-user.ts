import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "../supabase/server";

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}
