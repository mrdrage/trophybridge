import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type BinaryLike,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export class CredentialDecryptionError extends Error {
  constructor(message = "Unable to decrypt stored credential") {
    super(message);
    this.name = "CredentialDecryptionError";
  }
}

function decodeKey(value: string, label: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${label} must decode to exactly ${KEY_BYTES} bytes`);
  }
  return key;
}

function parseVersion(value: string | undefined): number {
  const parsed = Number(value ?? "1");
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("TOKEN_ENCRYPTION_KEY_VERSION must be a positive integer");
  }
  return parsed;
}

export class TokenCipher {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    private readonly activeKeyVersion: number,
  ) {
    if (!keys.has(activeKeyVersion)) {
      throw new Error("Active token-encryption key version is not configured");
    }
  }

  encrypt(plaintext: string, aad: BinaryLike): EncryptedSecret {
    if (!plaintext) throw new Error("Cannot encrypt an empty credential");

    const key = this.keys.get(this.activeKeyVersion);
    if (!key) throw new Error("Active token-encryption key is unavailable");

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: this.activeKeyVersion,
    };
  }

  decrypt(envelope: EncryptedSecret, aad: BinaryLike): string {
    const key = this.keys.get(envelope.keyVersion);
    if (!key) {
      throw new CredentialDecryptionError(
        `Unknown credential key version ${envelope.keyVersion}`,
      );
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(envelope.iv, "base64"),
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]);

      return plaintext.toString("utf8");
    } catch {
      throw new CredentialDecryptionError();
    }
  }
}

export function createTokenCipherFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TokenCipher {
  const activeRaw = env.TOKEN_ENCRYPTION_KEY;
  if (!activeRaw) throw new Error("TOKEN_ENCRYPTION_KEY is required");

  const activeVersion = parseVersion(env.TOKEN_ENCRYPTION_KEY_VERSION);
  const keys = new Map<number, Buffer>([
    [activeVersion, decodeKey(activeRaw, "TOKEN_ENCRYPTION_KEY")],
  ]);

  const previousRaw = env.TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON?.trim();
  if (previousRaw) {
    let previous: unknown;
    try {
      previous = JSON.parse(previousRaw);
    } catch {
      throw new Error("TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON must be valid JSON");
    }

    if (!previous || typeof previous !== "object" || Array.isArray(previous)) {
      throw new Error("TOKEN_ENCRYPTION_PREVIOUS_KEYS_JSON must be a JSON object");
    }

    for (const [versionRaw, keyRaw] of Object.entries(previous)) {
      const version = Number(versionRaw);
      if (!Number.isInteger(version) || version < 1 || typeof keyRaw !== "string") {
        throw new Error("Previous token-encryption keys must map positive versions to base64 strings");
      }
      if (!keys.has(version)) {
        keys.set(version, decodeKey(keyRaw, `previous key ${version}`));
      }
    }
  }

  return new TokenCipher(keys, activeVersion);
}
