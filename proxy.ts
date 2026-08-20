import { NextResponse, type NextRequest } from "next/server";

import { isTrustedMutationRequest } from "@/lib/http/request-origin";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/private/") &&
    !isTrustedMutationRequest(request.method, request.headers, request.nextUrl.origin)
  ) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_ORIGIN",
          message: "Private mutation rejected because the request origin is not trusted.",
          retryable: false,
        },
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/dashboard/:path*", "/auth/:path*", "/api/private/:path*"],
};
