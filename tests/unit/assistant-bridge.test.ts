import { afterEach, describe, expect, it } from "vitest";

import { isAssistantBridgeAuthorized } from "../../lib/auth/assistant-bridge";

const original = process.env.TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN;

afterEach(() => {
  if (original == null) delete process.env.TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN;
  else process.env.TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN = original;
});

describe("assistant bridge authorization", () => {
  it("fails closed when the server secret is not configured", () => {
    delete process.env.TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN;
    const request = new Request("https://example.test", {
      headers: { Authorization: `Bearer ${"x".repeat(43)}` },
    });
    expect(isAssistantBridgeAuthorized(request)).toBe(false);
  });

  it("accepts only the exact configured bearer secret", () => {
    const secret = "s".repeat(43);
    process.env.TROPHYBRIDGE_ASSISTANT_BRIDGE_TOKEN = secret;

    expect(
      isAssistantBridgeAuthorized(
        new Request("https://example.test", { headers: { Authorization: `Bearer ${secret}` } }),
      ),
    ).toBe(true);
    expect(
      isAssistantBridgeAuthorized(
        new Request("https://example.test", {
          headers: { Authorization: `Bearer ${"t".repeat(43)}` },
        }),
      ),
    ).toBe(false);
  });
});
