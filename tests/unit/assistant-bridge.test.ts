import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashAssistantBridgeToken,
  readAssistantBridgeToken,
} from "../../lib/auth/assistant-bridge";

describe("assistant bridge one-time capability", () => {
  const token = `tba1_${"A".repeat(43)}`;

  it("accepts only a correctly shaped bearer capability", () => {
    expect(
      readAssistantBridgeToken(
        new Request("https://example.test", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
    ).toBe(token);

    expect(readAssistantBridgeToken(new Request("https://example.test"))).toBeNull();
    expect(
      readAssistantBridgeToken(
        new Request("https://example.test", {
          headers: { Authorization: `Basic ${token}` },
        }),
      ),
    ).toBeNull();
    expect(
      readAssistantBridgeToken(
        new Request("https://example.test", {
          headers: { Authorization: `Bearer tba1_${"x".repeat(42)}` },
        }),
      ),
    ).toBeNull();
  });

  it("hashes the capability before repository lookup", () => {
    expect(hashAssistantBridgeToken(token)).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(hashAssistantBridgeToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
