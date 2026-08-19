export type PsnProviderErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_RESPONSE"
  | "UPSTREAM_UNAVAILABLE";

export class PsnProviderError extends Error {
  constructor(
    public readonly code: PsnProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly upstreamCode?: string | number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PsnProviderError";
  }
}

interface UpstreamErrorShape {
  error?: {
    code?: string | number;
    message?: string;
  };
}

export function throwIfPsnError(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;

  const { error } = payload as UpstreamErrorShape;
  if (!error) return;

  throw normalizePsnError(
    new Error(error.message ?? "PlayStation Network returned an error"),
    error.code,
  );
}

export function normalizePsnError(
  error: unknown,
  upstreamCode?: string | number,
): PsnProviderError {
  if (error instanceof PsnProviderError) return error;

  const message = error instanceof Error ? error.message : "Unexpected PlayStation Network error";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("authentication") ||
    normalized.includes("access token") ||
    normalized.includes("invalid token") ||
    normalized.includes("expired token")
  ) {
    return new PsnProviderError("AUTH_REQUIRED", message, false, upstreamCode, {
      cause: error,
    });
  }

  if (
    normalized.includes("not permitted") ||
    normalized.includes("forbidden") ||
    normalized.includes("access control")
  ) {
    return new PsnProviderError("FORBIDDEN", message, false, upstreamCode, {
      cause: error,
    });
  }

  if (normalized.includes("not found") || normalized.includes("resource not found")) {
    return new PsnProviderError("NOT_FOUND", message, false, upstreamCode, {
      cause: error,
    });
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    String(upstreamCode ?? "") === "429"
  ) {
    return new PsnProviderError("RATE_LIMITED", message, true, upstreamCode, {
      cause: error,
    });
  }

  return new PsnProviderError("UPSTREAM_UNAVAILABLE", message, true, upstreamCode, {
    cause: error,
  });
}

export function invalidPsnResponse(message: string, cause?: unknown): PsnProviderError {
  return new PsnProviderError("INVALID_RESPONSE", message, false, undefined, {
    cause,
  });
}
