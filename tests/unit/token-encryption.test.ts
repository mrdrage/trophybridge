import { describe, expect, it } from "vitest";

import {
  CredentialDecryptionError,
  TokenCipher,
  createTokenCipherFromEnv,
} from "../../lib/crypto/token-encryption";

const key1 = Buffer.alloc(32, 1);
const key2 = Buffer.alloc(32, 2);

describe("TokenCipher", () => {
  it("round-trips a refresh credential with authenticated context", () => {
    const cipher = new TokenCipher(new Map([[2, key2]]), 2);
    const encrypted = cipher.encrypt("refresh-secret", "account:123");

    expect(encrypted.ciphertext).not.toContain("refresh-secret");
    expect(encrypted.keyVersion).toBe(2);
    expect(cipher.decrypt(encrypted, "account:123")).toBe("refresh-secret");
  });

  it("rejects decryption when the account-bound AAD changes", () => {
    const cipher = new TokenCipher(new Map([[1, key1]]), 1);
    const encrypted = cipher.encrypt("refresh-secret", "account:123");

    expect(() => cipher.decrypt(encrypted, "account:other")).toThrow(
      CredentialDecryptionError,
    );
  });

  it("can decrypt an old key version while encrypting with the active version", () => {
    const oldCipher = new TokenCipher(new Map([[1, key1]]), 1);
    const encrypted = oldCipher.encrypt("legacy-refresh", "account:123");
    const rotating = new TokenCipher(
      new Map([
        [1, key1],
        [2, key2],
      ]),
      2,
    );

    expect(rotating.decrypt(encrypted, "account:123")).toBe("legacy-refresh");
    expect(rotating.encrypt("new-refresh", "account:123").keyVersion).toBe(2);
  });

  it("requires a 32-byte base64 environment key", () => {
    expect(() =>
      createTokenCipherFromEnv({ TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrow(/32 bytes/);
  });
});
