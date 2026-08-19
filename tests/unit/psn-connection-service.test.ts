import { describe, expect, it } from "vitest";

import { TokenCipher } from "../../lib/crypto/token-encryption";
import { PsnAuthClient, type PsnAuthCalls } from "../../lib/psn/auth-client";
import type {
  PsnAccountRecord,
  PsnAuthRepository,
  PsnAuthStatus,
  PsnCredentialRecord,
  SaveCredentialInput,
} from "../../lib/psn/auth-repository";
import { PsnConnectionService } from "../../lib/psn/connection-service";

class MemoryRepository implements PsnAuthRepository {
  account: PsnAccountRecord | null = null;
  credential: PsnCredentialRecord | null = null;

  async getAccountForOwner(ownerUserId: string) {
    return this.account?.ownerUserId === ownerUserId ? this.account : null;
  }

  async upsertAccount(input: {
    ownerUserId: string;
    psnOnlineId: string;
    psnAccountId: string;
    preferredLocale: string;
  }) {
    this.account = {
      id: "internal-account-id",
      ownerUserId: input.ownerUserId,
      psnOnlineId: input.psnOnlineId,
      psnAccountId: input.psnAccountId,
      authStatus: "refreshing",
      preferredLocale: input.preferredLocale,
    };
    return this.account;
  }

  async getCredential(psnAccountId: string) {
    return this.credential?.psnAccountId === psnAccountId ? this.credential : null;
  }

  async saveCredential(input: SaveCredentialInput) {
    this.credential = { ...input };
  }

  async setAuthStatus(_psnAccountId: string, status: PsnAuthStatus) {
    if (this.account) this.account = { ...this.account, authStatus: status };
  }

  async clearCredential() {
    this.credential = null;
  }
}

function authCalls(): PsnAuthCalls {
  return {
    exchangeNpssoForAccessCode: async () => "access-code",
    exchangeAccessCodeForAuthTokens: async () => ({
      accessToken: "access-token",
      expiresIn: 3600,
      refreshToken: "refresh-token-secret",
      refreshTokenExpiresIn: 86400,
    }),
    exchangeRefreshTokenForAuthTokens: async () => ({
      accessToken: "new-access",
      expiresIn: 3600,
      refreshToken: "rotated-secret",
      refreshTokenExpiresIn: 172800,
    }),
    makeUniversalSearch: async () => ({
      domainResponses: [
        { results: [{ socialMetadata: { accountId: "123456789", onlineId: "mrdrage2" } }] },
      ],
    }),
    getProfileFromUserName: async () => ({
      profile: { accountId: "123456789", onlineId: "mrdrage2" },
    }),
    getProfileFromAccountId: async () => ({ onlineId: "mrdrage2", isMe: true }),
  };
}

function service(repository: MemoryRepository, now = new Date("2026-08-19T10:00:00Z")) {
  return new PsnConnectionService(
    new PsnAuthClient(authCalls()),
    repository,
    new TokenCipher(new Map([[1, Buffer.alloc(32, 9)]]), 1),
    "it-IT",
    () => now,
  );
}

describe("PsnConnectionService", () => {
  it("persists only an encrypted refresh credential and the Italian locale", async () => {
    const repository = new MemoryRepository();
    const connection = service(repository);

    const account = await connection.connect({
      ownerUserId: "owner-1",
      onlineId: "mrdrage2",
      npsso: "n".repeat(64),
    });

    expect(account.authStatus).toBe("connected");
    expect(account.preferredLocale).toBe("it-IT");
    expect(repository.credential?.ciphertext).not.toContain("refresh-token-secret");
    expect(JSON.stringify(repository)).not.toContain("n".repeat(64));
    expect(JSON.stringify(repository)).not.toContain("access-token");
  });

  it("refreshes and re-encrypts a rotated refresh token", async () => {
    const repository = new MemoryRepository();
    const connection = service(repository);
    await connection.connect({ ownerUserId: "owner-1", onlineId: "mrdrage2", npsso: "n".repeat(64) });
    const before = repository.credential?.ciphertext;

    const session = await connection.refreshAuthorization("owner-1");

    expect(session.accessToken).toBe("new-access");
    expect(repository.account?.authStatus).toBe("connected");
    expect(repository.credential?.ciphertext).not.toBe(before);
    expect(JSON.stringify(repository)).not.toContain("rotated-secret");
  });

  it("clears expired durable authorization and requires reauthentication", async () => {
    const repository = new MemoryRepository();
    const connection = service(repository, new Date("2026-08-19T10:00:00Z"));
    await connection.connect({ ownerUserId: "owner-1", onlineId: "mrdrage2", npsso: "n".repeat(64) });
    if (repository.credential) repository.credential.refreshTokenExpiresAt = "2026-08-19T09:00:00Z";

    await expect(connection.refreshAuthorization("owner-1")).rejects.toMatchObject({
      code: "REAUTH_REQUIRED",
    });
    expect(repository.credential).toBeNull();
    expect(repository.account?.authStatus).toBe("reauth_required");
  });

  it("disconnects credentials without deleting normalized account identity", async () => {
    const repository = new MemoryRepository();
    const connection = service(repository);
    await connection.connect({ ownerUserId: "owner-1", onlineId: "mrdrage2", npsso: "n".repeat(64) });

    const account = await connection.disconnect("owner-1");

    expect(repository.credential).toBeNull();
    expect(account.psnOnlineId).toBe("mrdrage2");
    expect(account.authStatus).toBe("reauth_required");
  });
});
