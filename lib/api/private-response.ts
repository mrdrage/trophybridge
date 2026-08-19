import { NextResponse } from "next/server";

import { PsnConnectionError, normalizeConnectionError } from "../psn/connection-errors";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
} as const;

export function privateJson(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: privateHeaders,
  });
}

export function unauthorizedResponse() {
  return privateJson(
    { error: { code: "UNAUTHORIZED", message: "Autenticazione TrophyBridge richiesta." } },
    { status: 401 },
  );
}

export function psnErrorResponse(error: unknown) {
  const normalized =
    error instanceof PsnConnectionError ? error : normalizeConnectionError(error);

  return privateJson(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
      },
    },
    { status: normalized.httpStatus },
  );
}
