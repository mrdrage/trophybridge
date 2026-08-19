import { NextResponse } from "next/server";

import { getAppUrl } from "@/lib/config/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login?error=callback", getAppUrl()));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth/login?error=session", getAppUrl()));
  }

  const response = NextResponse.redirect(new URL("/dashboard", getAppUrl()));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
