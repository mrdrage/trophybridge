import { NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/http/request-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request.headers, url.origin);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login?error=callback", origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth/login?error=session", origin));
  }

  const response = NextResponse.redirect(new URL("/dashboard", origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
