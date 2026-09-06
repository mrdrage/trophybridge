import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeRefreshTokenForAuthTokens } from "psn-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pinned psn-api refresh patch", () => {
  it("preserves invalid_grant from the real installed adapter", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "invalid_grant", error_description: "Refresh token rejected" }, 400),
    ) as typeof fetch;

    const result = (await exchangeRefreshTokenForAuthTokens("fixture-refresh-token")) as unknown as Record<
      string,
      unknown
    >;

    expect(result.error).toBe("invalid_grant");
    expect(result.accessToken).toBeUndefined();
  });

  it("preserves retryable OAuth error payloads instead of turning them into reauth", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "temporarily_unavailable" }, 503),
    ) as typeof fetch;

    const result = (await exchangeRefreshTokenForAuthTokens("fixture-refresh-token")) as unknown as Record<
      string,
      unknown
    >;

    expect(result.error).toBe("temporarily_unavailable");
    expect(result.accessToken).toBeUndefined();
  });

  it("does not change successful token mapping", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        access_token: "new-access",
        expires_in: 3600,
        refresh_token: "rotated-refresh",
        refresh_token_expires_in: 86400,
        token_type: "bearer",
        scope: "psn:mobile.v2.core psn:clientapp",
      }),
    ) as typeof fetch;

    const result = (await exchangeRefreshTokenForAuthTokens("fixture-refresh-token")) as unknown as Record<
      string,
      unknown
    >;

    expect(result).toMatchObject({
      accessToken: "new-access",
      expiresIn: 3600,
      refreshToken: "rotated-refresh",
      refreshTokenExpiresIn: 86400,
      tokenType: "bearer",
    });
    expect(result.error).toBeUndefined();
  });

  it("still surfaces network failures as thrown errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("network down");
    }) as typeof fetch;

    await expect(exchangeRefreshTokenForAuthTokens("fixture-refresh-token")).rejects.toThrow(
      "network down",
    );
  });
});
