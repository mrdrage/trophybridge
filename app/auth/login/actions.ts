"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRequestOrigin } from "@/lib/http/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signInWithGitHub() {
  const requestHeaders = await headers();
  const origin = getRequestOrigin(requestHeaders);
  const supabase = await createServerSupabaseClient();
  const redirectTo = new URL("/auth/callback", origin).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    redirect("/auth/login?error=oauth");
  }

  redirect(data.url);
}
