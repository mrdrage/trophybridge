type HeaderReader = Pick<Headers, "get">;

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(",", 1)[0]?.trim();
  return first || undefined;
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(":", 1)[0]?.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function getRequestOrigin(
  headers: HeaderReader,
  fallbackOrigin?: string,
): string {
  const host =
    firstHeaderValue(headers.get("x-forwarded-host")) ??
    firstHeaderValue(headers.get("host"));

  if (!host) {
    if (fallbackOrigin) return new URL(fallbackOrigin).origin;
    throw new Error("Request host is unavailable");
  }

  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const protocol = forwardedProto ?? (isLocalHost(host) ? "http" : "https");

  if (protocol !== "http" && protocol !== "https") {
    throw new Error("Request protocol is invalid");
  }

  return new URL(`${protocol}://${host}`).origin;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isTrustedMutationRequest(
  method: string,
  headers: HeaderReader,
  fallbackOrigin?: string,
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;

  const originHeader = headers.get("origin")?.trim();
  if (!originHeader || originHeader === "null") return false;

  try {
    const suppliedOrigin = new URL(originHeader).origin;
    const requestOrigin = getRequestOrigin(headers, fallbackOrigin);
    return suppliedOrigin === requestOrigin;
  } catch {
    return false;
  }
}
