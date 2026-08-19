import { describe, expect, it } from "vitest";

import { PsnAuthClient, type PsnAuthCalls } from "../../lib/psn/auth-client";
import { PsnConnectionError } from "../../lib/psn/connection-errors";

function calls(overrides: Partial<PsnAuthCalls> = {}): PsnAuthCalls {
  return {
    exchangeNpssoForAccessCode: async () => "access-code",
    exchangeAccessCodeForAuthTokens: async () => ({
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "refresh-token",
      refreshTokenExpiresIn: 86400,
    }),
    exchangeRefreshTokenForAuthTokens: async () => ({
      accessToken: "refreshed-access",
      expiresIn: 3600,
      refreshToken: "rotated-refresh",
      refreshTokenExpiresIn: 172800,
    }),
    makeUniversalSearch: async () => ({
      domainResponses: [
        {
          results: [
            { socialMetadata: { accountId: "123456789", onlineId: "mrdrage2" } },
          ],
        },
      ],
    }),
    getProfileFromUserName: async () => ({
      profile: { accountId: "123456789", onlineId: "mrdrage2" },
    }),
    getProfileFromAccountId: async () => ({ onlineId: "mrdrage2", isMe: true }),
    ...overrides,
  };
}

describe("PsnAuthClient", () => {
  it("accepts only an exact searched identity that belongs to the authenticating token", async () => {
    const result = await new PsnAuthClient(calls()).connectWithNpsso(
      "n".repeat(64),
      "mrdrage2",
    );

    expect(result.account).toEqual({ accountId: "123456789", onlineId: "mrdrage2" });
    expect(result.refreshToken).toBe("refresh-token");
  });

  it("falls back to direct username lookup when PSN search omits the owner profile", async () => {
    const client = new PsnAuthClient(
      calls({
        makeUniversalSearch: async () => ({ domainResponses: [{ results: [] }] }),
      }),
    );

    const result = await client.connectWithNpsso("n".repeat(64), "mrdrage2");

    expect(result.account).toEqual({ accountId: "123456789", onlineId: "mrdrage2" });
  });

  it("rejects a token belonging to another PSN identity", async () => {
    const client = new PsnAuthClient(
      calls({ getProfileFromAccountId: async () => ({ onlineId: "mrdrage2", isMe: false }) }),
    );

    await expect(client.connectWithNpsso("n".repeat(64), "mrdrage2")).rejects.toMatchObject({
      code: "IDENTITY_MISMATCH",
    } satisfies Partial<PsnConnectionError>);
  });

  it("normalizes invalid NPSSO bootstrap failures", async () => {
    const client = new PsnAuthClient(
      calls({ exchangeNpssoForAccessCode: async () => { throw new Error("redacted upstream failure"); } }),
    );

    await expect(client.connectWithNpsso("n".repeat(64), "mrdrage2")).rejects.toMatchObject({
      code: "INVALID_NPSSO",
    } satisfies Partial<PsnConnectionError>);
  });

  it("supports refresh-token rotation and an upstream refresh without rotation", async () => {
    const rotating = await new PsnAuthClient(calls()).refresh("old");
    expect(rotating.refreshToken).toBe("rotated-refresh");

    const retaining = await new PsnAuthClient(
      calls({
        exchangeRefreshTokenForAuthTokens: async () => ({
          accessToken: "new-access",
          expiresIn: 3600,
        }),
      }),
    ).refresh("old");
    expect(retaining.refreshToken).toBeNull();
  });
});
