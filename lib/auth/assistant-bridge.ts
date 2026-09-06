import { createHash, timingSafeEqual } from "node:crypto";

import { getAssistantBridgeToken } from "../config/server";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isAssistantBridgeAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, supplied] = header.split(" ", 2);
  if (scheme !== "Bearer" || !supplied) return false;

  const expected = digest(getAssistantBridgeToken());
  const actual = digest(supplied);
  return timingSafeEqual(expected, actual);
}
