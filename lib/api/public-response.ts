import { randomUUID } from "node:crypto";

import { ShareError } from "../sharing/errors";

const publicHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function publicJson(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...publicHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function publicShareErrorResponse(error: unknown) {
  const requestId = randomUUID();

  if (error instanceof ShareError) {
    const headers: Record<string, string> = {};
    if (error.retryAfterSeconds != null) {
      headers["Retry-After"] = String(error.retryAfterSeconds);
    }
    return publicJson(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
        request_id: requestId,
      },
      { status: error.httpStatus, headers },
    );
  }

  return publicJson(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "TrophyBridge non riesce a completare la richiesta pubblica.",
        retryable: true,
      },
      request_id: requestId,
    },
    { status: 500 },
  );
}
