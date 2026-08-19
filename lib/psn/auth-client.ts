import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId,
  getProfileFromUserName,
  makeUniversalSearch,
} from "psn-api";
import { z } from "zod";

import { PsnConnectionError } from "./connection-errors";
import type { PsnAccount } from "./provider";

export interface PsnAuthCalls {
  exchangeNpssoForAccessCode(npsso: string): Promise<string>;
  exchangeAccessCodeForAuthTokens(code: string): Promise<unknown>;
  exchangeRefreshTokenForAuthTokens(refreshToken: string): Promise<unknown>;
  makeUniversalSearch(
    authorization: { accessToken: string },
    searchTerm: string,
    domain: "SocialAllAccounts",
  ): Promise<unknown>;
  getProfileFromUserName(
    authorization: { accessToken: string },
    onlineId: string,
  ): Promise<unknown>;
  getProfileFromAccountId(
    authorization: { accessToken: string },
    accountId: string,
  ): Promise<unknown>;
}

const defaultCalls: PsnAuthCalls = {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  makeUniversalSearch: (authorization, searchTerm, domain) =>
    makeUniversalSearch(authorization, searchTerm, domain),
  getProfileFromUserName,
  getProfileFromAccountId,
};

const initialTokensSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresIn: z.number().int().positive(),
    refreshToken: z.string().min(1),
    refreshTokenExpiresIn: z.number().int().positive(),
  })
  .passthrough();

const refreshedTokensSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresIn: z.number().int().positive(),
    refreshToken: z.string().min(1).nullable().optional(),
    refreshTokenExpiresIn: z.number().int().positive().nullable().optional(),
  })
  .passthrough();

const socialSearchSchema = z
  .object({
    domainResponses: z.array(
      z
        .object({
          results: z.array(
            z
              .object({
                socialMetadata: z
                  .object({
                    accountId: z.string().min(1),
                    onlineId: z.string().min(1),
                  })
                  .passthrough(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const legacyProfileSchema = z
  .object({
    profile: z
      .object({
        accountId: z.string().min(1),
        onlineId: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

const profileSchema = z
  .object({
    onlineId: z.string().min(1),
    isMe: z.boolean(),
  })
  .passthrough();

export interface InitialPsnAuthorization {
  account: PsnAccount;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

export interface RefreshedPsnAuthorization {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string | null;
  refreshTokenExpiresIn: number | null;
}

function sameOnlineId(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("en-US") === right.trim().toLocaleLowerCase("en-US");
}

export class PsnAuthClient {
  constructor(private readonly calls: PsnAuthCalls = defaultCalls) {}

  async connectWithNpsso(
    npsso: string,
    claimedOnlineId: string,
  ): Promise<InitialPsnAuthorization> {
    let accessCode: string;
    try {
      accessCode = await this.calls.exchangeNpssoForAccessCode(npsso);
    } catch {
      throw new PsnConnectionError("INVALID_NPSSO");
    }

    let rawTokens: unknown;
    try {
      rawTokens = await this.calls.exchangeAccessCodeForAuthTokens(accessCode);
    } catch {
      throw new PsnConnectionError("UPSTREAM_UNAVAILABLE", { retryable: true });
    }

    const tokens = initialTokensSchema.safeParse(rawTokens);
    if (!tokens.success) {
      throw new PsnConnectionError("INVALID_NPSSO");
    }

    const account = await this.resolveAuthenticatedAccount(
      tokens.data.accessToken,
      claimedOnlineId,
    );

    return {
      account,
      accessToken: tokens.data.accessToken,
      accessTokenExpiresIn: tokens.data.expiresIn,
      refreshToken: tokens.data.refreshToken,
      refreshTokenExpiresIn: tokens.data.refreshTokenExpiresIn,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshedPsnAuthorization> {
    let rawTokens: unknown;
    try {
      rawTokens = await this.calls.exchangeRefreshTokenForAuthTokens(refreshToken);
    } catch {
      throw new PsnConnectionError("UPSTREAM_UNAVAILABLE", { retryable: true });
    }

    const tokens = refreshedTokensSchema.safeParse(rawTokens);
    if (!tokens.success) {
      throw new PsnConnectionError("REAUTH_REQUIRED");
    }

    return {
      accessToken: tokens.data.accessToken,
      accessTokenExpiresIn: tokens.data.expiresIn,
      refreshToken: tokens.data.refreshToken ?? null,
      refreshTokenExpiresIn: tokens.data.refreshTokenExpiresIn ?? null,
    };
  }

  private async resolveAuthenticatedAccount(
    accessToken: string,
    claimedOnlineId: string,
  ): Promise<PsnAccount> {
    const authorization = { accessToken };
    let accountId: string | null = null;

    try {
      const rawSearch = await this.calls.makeUniversalSearch(
        authorization,
        claimedOnlineId,
        "SocialAllAccounts",
      );
      const search = socialSearchSchema.safeParse(rawSearch);
      if (!search.success) throw new PsnConnectionError("INVALID_RESPONSE");

      const match = search.data.domainResponses
        .flatMap((domain) => domain.results)
        .find((result) => sameOnlineId(result.socialMetadata.onlineId, claimedOnlineId));
      accountId = match?.socialMetadata.accountId ?? null;
    } catch (error) {
      if (error instanceof PsnConnectionError) throw error;
      // Search is best-effort: some valid owner profiles are omitted by PSN search.
    }

    if (!accountId) {
      let rawLegacyProfile: unknown;
      try {
        rawLegacyProfile = await this.calls.getProfileFromUserName(authorization, claimedOnlineId);
      } catch {
        throw new PsnConnectionError("IDENTITY_NOT_FOUND");
      }

      const legacyProfile = legacyProfileSchema.safeParse(rawLegacyProfile);
      if (!legacyProfile.success) throw new PsnConnectionError("INVALID_RESPONSE");
      if (!sameOnlineId(legacyProfile.data.profile.onlineId, claimedOnlineId)) {
        throw new PsnConnectionError("IDENTITY_MISMATCH");
      }
      accountId = legacyProfile.data.profile.accountId;
    }

    let rawProfile: unknown;
    try {
      rawProfile = await this.calls.getProfileFromAccountId(authorization, accountId);
    } catch {
      throw new PsnConnectionError("UPSTREAM_UNAVAILABLE", { retryable: true });
    }

    const profile = profileSchema.safeParse(rawProfile);
    if (!profile.success) {
      throw new PsnConnectionError("INVALID_RESPONSE");
    }
    if (!profile.data.isMe) {
      throw new PsnConnectionError("IDENTITY_MISMATCH");
    }
    if (!sameOnlineId(profile.data.onlineId, claimedOnlineId)) {
      throw new PsnConnectionError("IDENTITY_MISMATCH");
    }

    return {
      accountId,
      onlineId: profile.data.onlineId,
    };
  }
}
