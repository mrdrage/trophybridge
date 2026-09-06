import { createHash } from "node:crypto";

const ASSISTANT_BRIDGE_TOKEN_PATTERN = /^tba1_[A-Za-z0-9_-]{43}$/;

export function readAssistantBridgeToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, supplied] = header.split(" ", 2);
  if (scheme !== "Bearer" || !supplied) return null;
  return ASSISTANT_BRIDGE_TOKEN_PATTERN.test(supplied) ? supplied : null;
}

export function hashAssistantBridgeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
