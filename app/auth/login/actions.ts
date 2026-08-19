"use server";

import { redirect } from "next/navigation";

import { getAppUrl } from "@/lib/config/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signInWithGitHub() {
  const supabase = await createServerSupabaseClient();
  const redirectTo = new URL("/auth/callback", getAppUrl()).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    redirect("/auth/login?error=oauth");
  }

  redirect(data.url);
}
