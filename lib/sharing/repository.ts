import type { SupabaseClient } from "@supabase/supabase-js";

import { ShareError } from "./errors";
import type {
  AiRefreshClaim,
  OwnerShareStatus,
  ResolvedShareLink,
  SharingRepository,
  VisibleGamePage,
  VisibleGameRecord,
} from "./types";

function storageFailure(): never {
  throw new ShareError("STORAGE_ERROR");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function statusFromRow(value: unknown): OwnerShareStatus {
  const row = objectValue(value);
  if (!row) return { active: false, createdAt: null, lastUsedAt: null };
  return {
    active: row.is_active === true,
    createdAt: stringValue(row.created_at),
    lastUsedAt: stringValue(row.last_used_at),
  };
}

export class SupabaseSharingRepository implements SharingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getActiveLink(psnAccountId: string): Promise<OwnerShareStatus> {
    const { data, error } = await this.client
      .from("share_links")
      .select("is_active,created_at,last_used_at")
      .eq("psn_account_id", psnAccountId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) storageFailure();
    return statusFromRow(data);
  }

  async rotateActiveLink(
    psnAccountId: string,
    tokenHash: string,
    createdAt: string,
  ): Promise<OwnerShareStatus> {
    const { data, error } = await this.client.rpc("rotate_account_share_link", {
      p_psn_account_id: psnAccountId,
      p_token_hash: tokenHash,
      p_created_at: createdAt,
      p_label: "AI share",
    });

    if (error) storageFailure();
    const row = Array.isArray(data) ? data[0] : data;
    const parsed = statusFromRow(row);
    if (!parsed.active || !parsed.createdAt) storageFailure();
    return parsed;
  }

  async revokeActiveLink(psnAccountId: string, revokedAt: string): Promise<OwnerShareStatus> {
    const { data, error } = await this.client.rpc("revoke_account_share_link", {
      p_psn_account_id: psnAccountId,
      p_revoked_at: revokedAt,
    });

    if (error) storageFailure();
    const row = Array.isArray(data) ? data[0] : data;
    const parsed = statusFromRow(row);
    return { ...parsed, active: false };
  }

  async resolveByTokenHash(tokenHash: string): Promise<ResolvedShareLink | null> {
    const { data, error } = await this.client
      .from("share_links")
      .select(
        "id,psn_account_id,is_active,created_at,last_used_at,revoked_at,psn_accounts!inner(owner_user_id,psn_online_id,preferred_locale,last_successful_sync_at)",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) storageFailure();
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    const account = objectValue(row.psn_accounts);
    const linkId = stringValue(row.id);
    const psnAccountId = stringValue(row.psn_account_id);
    const ownerUserId = stringValue(account?.owner_user_id);
    const onlineId = stringValue(account?.psn_online_id);
    const preferredLocale = stringValue(account?.preferred_locale);
    const createdAt = stringValue(row.created_at);
    if (!linkId || !psnAccountId || !ownerUserId || !onlineId || !preferredLocale || !createdAt) {
      storageFailure();
    }

    return {
      linkId,
      psnAccountId,
      ownerUserId,
      onlineId,
      preferredLocale,
      lastSuccessfulSyncAt: stringValue(account?.last_successful_sync_at),
      createdAt,
      lastUsedAt: stringValue(row.last_used_at),
      active: row.is_active === true,
      revokedAt: stringValue(row.revoked_at),
    };
  }

  async touchLink(linkId: string, usedAt: string, olderThan: string): Promise<void> {
    const { error } = await this.client
      .from("share_links")
      .update({ last_used_at: usedAt })
      .eq("id", linkId)
      .eq("is_active", true)
      .or(`last_used_at.is.null,last_used_at.lt.${olderThan}`);

    if (error) storageFailure();
  }

  async claimAiRefresh(
    linkId: string,
    claimedAt: string,
    windowSeconds: number,
    maxClaims: number,
  ): Promise<AiRefreshClaim> {
    const { data, error } = await this.client.rpc("claim_share_ai_refresh", {
      p_link_id: linkId,
      p_claimed_at: claimedAt,
      p_window_seconds: windowSeconds,
      p_max_claims: maxClaims,
    });

    if (error) storageFailure();
    const row = objectValue(data);
    if (!row || typeof row.allowed !== "boolean") storageFailure();
    const retryAfter = nullableNumber(row.retry_after_seconds);
    return {
      allowed: row.allowed,
      retryAfterSeconds: retryAfter == null ? null : Math.max(0, Math.ceil(retryAfter)),
    };
  }

  async listVisibleGames(psnAccountId: string, limit: number, offset: number): Promise<VisibleGamePage> {
    const { data, error, count } = await this.client
      .from("account_games")
      .select(
        "progress_percent,earned_bronze,earned_silver,earned_gold,earned_platinum,total_bronze,total_silver,total_gold,total_platinum,psn_last_updated_at,last_synced_at,games!inner(id,title_name,platforms,icon_url)",
        { count: "exact" },
      )
      .eq("psn_account_id", psnAccountId)
      .eq("is_hidden", false)
      .order("psn_last_updated_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) storageFailure();

    const games: VisibleGameRecord[] = [];
    for (const row of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
      const game = objectValue(row.games);
      const gameId = stringValue(game?.id);
      const title = stringValue(game?.title_name);
      if (!gameId || !title) storageFailure();

      games.push({
        gameId,
        title,
        platforms: stringArray(game?.platforms),
        iconUrl: stringValue(game?.icon_url),
        progressPercent: nullableNumber(row.progress_percent),
        earnedBronze: numberValue(row.earned_bronze),
        earnedSilver: numberValue(row.earned_silver),
        earnedGold: numberValue(row.earned_gold),
        earnedPlatinum: numberValue(row.earned_platinum),
        totalBronze: numberValue(row.total_bronze),
        totalSilver: numberValue(row.total_silver),
        totalGold: numberValue(row.total_gold),
        totalPlatinum: numberValue(row.total_platinum),
        psnLastUpdatedAt: stringValue(row.psn_last_updated_at),
        lastSyncedAt: stringValue(row.last_synced_at),
      });
    }

    return { totalCount: count ?? games.length, games };
  }

  async isGameVisible(psnAccountId: string, gameId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("account_games")
      .select("game_id")
      .eq("psn_account_id", psnAccountId)
      .eq("game_id", gameId)
      .eq("is_hidden", false)
      .maybeSingle();

    if (error) storageFailure();
    return Boolean(data);
  }
}
