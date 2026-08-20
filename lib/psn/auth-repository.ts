import type { SupabaseClient } from "@supabase/supabase-js";

import type { EncryptedSecret } from "../crypto/token-encryption";
import { PsnConnectionError } from "./connection-errors";

export type PsnAuthStatus = "connected" | "refreshing" | "reauth_required" | "error";

export interface PsnAccountRecord {
  id: string;
  ownerUserId: string;
  psnOnlineId: string;
  psnAccountId: string;
  authStatus: PsnAuthStatus;
  preferredLocale: string;
}

export interface PsnCredentialRecord extends EncryptedSecret {
  psnAccountId: string;
  refreshTokenExpiresAt: string | null;
  lastRefreshedAt: string;
}

export interface SaveCredentialInput extends EncryptedSecret {
  psnAccountId: string;
  refreshTokenExpiresAt: string | null;
  lastRefreshedAt: string;
}

export interface PsnAuthRepository {
  getAccountForOwner(ownerUserId: string): Promise<PsnAccountRecord | null>;
  upsertAccount(input: {
    ownerUserId: string;
    psnOnlineId: string;
    psnAccountId: string;
    preferredLocale: string;
  }): Promise<PsnAccountRecord>;
  getCredential(psnAccountId: string): Promise<PsnCredentialRecord | null>;
  saveCredential(input: SaveCredentialInput): Promise<void>;
  setAuthStatus(psnAccountId: string, status: PsnAuthStatus): Promise<void>;
  clearCredential(psnAccountId: string): Promise<void>;
}

const accountColumns =
  "id, owner_user_id, psn_online_id, psn_account_id, auth_status, preferred_locale";

function isAuthStatus(value: unknown): value is PsnAuthStatus {
  return (
    value === "connected" ||
    value === "refreshing" ||
    value === "reauth_required" ||
    value === "error"
  );
}

function mapAccount(row: Record<string, unknown>): PsnAccountRecord {
  if (
    typeof row.id !== "string" ||
    typeof row.owner_user_id !== "string" ||
    typeof row.psn_online_id !== "string" ||
    typeof row.psn_account_id !== "string" ||
    typeof row.preferred_locale !== "string" ||
    !isAuthStatus(row.auth_status)
  ) {
    throw new PsnConnectionError("STORAGE_ERROR");
  }

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    psnOnlineId: row.psn_online_id,
    psnAccountId: row.psn_account_id,
    authStatus: row.auth_status,
    preferredLocale: row.preferred_locale,
  };
}

function storageFailure(): never {
  throw new PsnConnectionError("STORAGE_ERROR");
}

export class SupabasePsnAuthRepository implements PsnAuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAccountForOwner(ownerUserId: string): Promise<PsnAccountRecord | null> {
    const { data, error } = await this.client
      .from("psn_accounts")
      .select(accountColumns)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();

    if (error) storageFailure();
    return data ? mapAccount(data as Record<string, unknown>) : null;
  }

  async upsertAccount(input: {
    ownerUserId: string;
    psnOnlineId: string;
    psnAccountId: string;
    preferredLocale: string;
  }): Promise<PsnAccountRecord> {
    const existingForOwner = await this.getAccountForOwner(input.ownerUserId);

    if (existingForOwner && existingForOwner.psnAccountId !== input.psnAccountId) {
      throw new PsnConnectionError("ACCOUNT_ALREADY_LINKED");
    }

    if (!existingForOwner) {
      const { data: existingProvider, error: providerError } = await this.client
        .from("psn_accounts")
        .select(accountColumns)
        .eq("psn_account_id", input.psnAccountId)
        .maybeSingle();

      if (providerError) storageFailure();
      if (
        existingProvider &&
        (existingProvider as Record<string, unknown>).owner_user_id !== input.ownerUserId
      ) {
        throw new PsnConnectionError("ACCOUNT_ALREADY_LINKED");
      }
    }

    if (existingForOwner) {
      const { data, error } = await this.client
        .from("psn_accounts")
        .update({
          psn_online_id: input.psnOnlineId,
          preferred_locale: input.preferredLocale,
          auth_status: "refreshing",
        })
        .eq("id", existingForOwner.id)
        .select(accountColumns)
        .single();

      if (error || !data) storageFailure();
      return mapAccount(data as Record<string, unknown>);
    }

    const { data, error } = await this.client
      .from("psn_accounts")
      .insert({
        owner_user_id: input.ownerUserId,
        psn_online_id: input.psnOnlineId,
        psn_account_id: input.psnAccountId,
        preferred_locale: input.preferredLocale,
        auth_status: "refreshing",
      })
      .select(accountColumns)
      .single();

    if (error || !data) storageFailure();
    return mapAccount(data as Record<string, unknown>);
  }

  async getCredential(psnAccountId: string): Promise<PsnCredentialRecord | null> {
    const { data, error } = await this.client
      .from("psn_credentials")
      .select(
        "psn_account_id, encrypted_refresh_token, encryption_iv, encryption_auth_tag, key_version, refresh_token_expires_at, last_refreshed_at",
      )
      .eq("psn_account_id", psnAccountId)
      .maybeSingle();

    if (error) storageFailure();
    if (!data) return null;

    const row = data as Record<string, unknown>;
    if (
      typeof row.psn_account_id !== "string" ||
      typeof row.encrypted_refresh_token !== "string" ||
      typeof row.encryption_iv !== "string" ||
      typeof row.encryption_auth_tag !== "string" ||
      typeof row.key_version !== "number" ||
      !(row.refresh_token_expires_at == null || typeof row.refresh_token_expires_at === "string") ||
      typeof row.last_refreshed_at !== "string"
    ) {
      storageFailure();
    }

    return {
      psnAccountId: row.psn_account_id as string,
      ciphertext: row.encrypted_refresh_token as string,
      iv: row.encryption_iv as string,
      authTag: row.encryption_auth_tag as string,
      keyVersion: row.key_version as number,
      refreshTokenExpiresAt: row.refresh_token_expires_at as string | null,
      lastRefreshedAt: row.last_refreshed_at as string,
    };
  }

  async saveCredential(input: SaveCredentialInput): Promise<void> {
    const { error } = await this.client.from("psn_credentials").upsert(
      {
        psn_account_id: input.psnAccountId,
        encrypted_refresh_token: input.ciphertext,
        encryption_iv: input.iv,
        encryption_auth_tag: input.authTag,
        key_version: input.keyVersion,
        refresh_token_expires_at: input.refreshTokenExpiresAt,
        last_refreshed_at: input.lastRefreshedAt,
      },
      { onConflict: "psn_account_id" },
    );

    if (error) storageFailure();
  }

  async setAuthStatus(psnAccountId: string, status: PsnAuthStatus): Promise<void> {
    const { error } = await this.client
      .from("psn_accounts")
      .update({ auth_status: status })
      .eq("id", psnAccountId);

    if (error) storageFailure();
  }

  async clearCredential(psnAccountId: string): Promise<void> {
    const { error } = await this.client
      .from("psn_credentials")
      .delete()
      .eq("psn_account_id", psnAccountId);

    if (error) storageFailure();
  }
}
