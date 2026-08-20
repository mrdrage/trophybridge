import {
  CredentialDecryptionError,
  type TokenCipher,
} from "../crypto/token-encryption";
import { PsnApiProvider } from "./psn-api-provider";
import { PsnAuthClient } from "./auth-client";
import {
  type PsnAccountRecord,
  type PsnAuthRepository,
  type PsnCredentialRecord,
} from "./auth-repository";
import { PsnConnectionError, normalizeConnectionError } from "./connection-errors";

export interface PsnAuthorizationSession {
  account: PsnAccountRecord;
  accessToken: string;
  accessTokenExpiresAt: string;
}

function addSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function credentialAad(account: PsnAccountRecord): string {
  return `trophybridge:psn-refresh:v1:${account.id}:${account.psnAccountId}`;
}

function validateConnectInput(onlineId: string, npsso: string, locale: string) {
  const normalizedOnlineId = onlineId.trim();
  const normalizedNpsso = npsso.trim();

  if (normalizedOnlineId.length < 1 || normalizedOnlineId.length > 32) {
    throw new PsnConnectionError("IDENTITY_NOT_FOUND");
  }
  if (normalizedNpsso.length < 32 || normalizedNpsso.length > 512) {
    throw new PsnConnectionError("INVALID_NPSSO");
  }
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
    throw new PsnConnectionError("INVALID_RESPONSE");
  }

  return { onlineId: normalizedOnlineId, npsso: normalizedNpsso };
}

export class PsnConnectionService {
  constructor(
    private readonly authClient: PsnAuthClient,
    private readonly repository: PsnAuthRepository,
    private readonly cipher: TokenCipher,
    private readonly defaultLocale = "it-IT",
    private readonly now: () => Date = () => new Date(),
  ) {}

  async connect(input: {
    ownerUserId: string;
    onlineId: string;
    npsso: string;
    locale?: string;
  }): Promise<PsnAccountRecord> {
    const locale = input.locale ?? this.defaultLocale;
    const values = validateConnectInput(input.onlineId, input.npsso, locale);
    const authorization = await this.authClient.connectWithNpsso(
      values.npsso,
      values.onlineId,
    );

    const account = await this.repository.upsertAccount({
      ownerUserId: input.ownerUserId,
      psnOnlineId: authorization.account.onlineId,
      psnAccountId: authorization.account.accountId,
      preferredLocale: locale,
    });

    const refreshedAt = this.now();
    const envelope = this.cipher.encrypt(
      authorization.refreshToken,
      credentialAad(account),
    );

    try {
      await this.repository.saveCredential({
        psnAccountId: account.id,
        ...envelope,
        refreshTokenExpiresAt: addSeconds(
          refreshedAt,
          authorization.refreshTokenExpiresIn,
        ),
        lastRefreshedAt: refreshedAt.toISOString(),
      });
      await this.repository.setAuthStatus(account.id, "connected");
    } catch (error) {
      try {
        await this.repository.setAuthStatus(account.id, "error");
      } catch {
        // Preserve the original storage failure without logging credential material.
      }
      throw error;
    }

    return { ...account, authStatus: "connected" };
  }

  async refreshAuthorization(ownerUserId: string): Promise<PsnAuthorizationSession> {
    const account = await this.repository.getAccountForOwner(ownerUserId);
    if (!account) throw new PsnConnectionError("NOT_CONNECTED");

    const credential = await this.repository.getCredential(account.id);
    if (!credential) {
      await this.repository.setAuthStatus(account.id, "reauth_required");
      throw new PsnConnectionError("REAUTH_REQUIRED");
    }

    const now = this.now();

    // A provider-reported absolute expiry is advisory, not authority. Sony can
    // continue accepting or rotating a refresh credential after that timestamp,
    // so TrophyBridge always attempts the refresh once and only asks for NPSSO
    // when PSN actually rejects the credential.
    await this.repository.setAuthStatus(account.id, "refreshing");

    let refreshToken: string;
    try {
      refreshToken = this.cipher.decrypt(credential, credentialAad(account));
    } catch (error) {
      await this.repository.setAuthStatus(account.id, "error");
      if (error instanceof CredentialDecryptionError) {
        throw new PsnConnectionError("CREDENTIAL_DECRYPTION_FAILED");
      }
      throw error;
    }

    try {
      const refreshed = await this.authClient.refresh(refreshToken);
      const tokenRotated =
        refreshed.refreshToken != null && refreshed.refreshToken !== refreshToken;
      const durableRefreshToken = refreshed.refreshToken ?? refreshToken;
      const nextExpiry = this.refreshExpiry(
        now,
        credential,
        refreshed.refreshTokenExpiresIn,
        tokenRotated,
      );
      const envelope = this.cipher.encrypt(durableRefreshToken, credentialAad(account));

      await this.repository.saveCredential({
        psnAccountId: account.id,
        ...envelope,
        refreshTokenExpiresAt: nextExpiry,
        lastRefreshedAt: now.toISOString(),
      });
      await this.repository.setAuthStatus(account.id, "connected");

      return {
        account: { ...account, authStatus: "connected" },
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: addSeconds(now, refreshed.accessTokenExpiresIn),
      };
    } catch (error) {
      const normalized = normalizeConnectionError(error);
      if (normalized.code === "REAUTH_REQUIRED") {
        await this.repository.clearCredential(account.id);
        await this.repository.setAuthStatus(account.id, "reauth_required");
      } else {
        await this.repository.setAuthStatus(account.id, "error");
      }
      throw normalized;
    }
  }

  async createProviderForOwner(ownerUserId: string): Promise<PsnApiProvider> {
    const session = await this.refreshAuthorization(ownerUserId);
    return new PsnApiProvider({
      authorization: { accessToken: session.accessToken },
      account: {
        accountId: session.account.psnAccountId,
        onlineId: session.account.psnOnlineId,
      },
      locale: session.account.preferredLocale,
    });
  }

  async disconnect(ownerUserId: string): Promise<PsnAccountRecord> {
    const account = await this.repository.getAccountForOwner(ownerUserId);
    if (!account) throw new PsnConnectionError("NOT_CONNECTED");

    await this.repository.clearCredential(account.id);
    await this.repository.setAuthStatus(account.id, "reauth_required");
    return { ...account, authStatus: "reauth_required" };
  }

  private refreshExpiry(
    now: Date,
    credential: PsnCredentialRecord,
    refreshTokenExpiresIn: number | null,
    tokenRotated: boolean,
  ): string | null {
    if (refreshTokenExpiresIn != null) {
      return addSeconds(now, refreshTokenExpiresIn);
    }

    // Sony can return a brand-new refresh token without repeating an expiry.
    // The old absolute expiry belongs to the old token, so inheriting it would
    // make TrophyBridge falsely demand a new NPSSO after that old date.
    if (tokenRotated) return null;

    // If Sony just accepted a credential after its recorded expiry, that local
    // timestamp is demonstrably stale. Forget it and let later PSN responses be
    // the source of truth instead of manufacturing a reauthentication deadline.
    if (
      credential.refreshTokenExpiresAt &&
      new Date(credential.refreshTokenExpiresAt).getTime() <= now.getTime()
    ) {
      return null;
    }

    return credential.refreshTokenExpiresAt;
  }
}
