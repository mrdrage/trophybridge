import { createHash, randomBytes } from "node:crypto";

import type { PsnAccountRecord } from "../psn/auth-repository";
import { PsnConnectionError } from "../psn/connection-errors";
import { PsnProviderError } from "../psn/errors";
import { TrophySyncError } from "../trophies/errors";
import type {
  GameSyncSummary,
  GameTrophyDetail,
  TrophyRepository,
  TrophyView,
} from "../trophies/types";
import { ShareError } from "./errors";
import type {
  OwnerShareStatus,
  PublicTrophyItem,
  PublicTrophyScope,
  PublicTrophyStatus,
  RotatedShareLink,
  SharingRepository,
  VisibleGameRecord,
} from "./types";
import { toPublicTrophy } from "./types";

const SHARE_TOKEN_PATTERN = /^tb1_[A-Za-z0-9_-]{43}$/;
const AI_REFRESH_WINDOW_SECONDS = 3600;

export interface SharingAccountReader {
  getAccountForOwner(ownerUserId: string): Promise<PsnAccountRecord | null>;
}

export interface PublicGameRefresher {
  sync(ownerUserId: string, gameId: string): Promise<GameSyncSummary>;
}

export interface AiContextPolicy {
  freshnessSeconds: number;
  maxRefreshesPerHour: number;
  maxMissingTrophies: number;
}

type RefreshOutcome =
  | "not_requested"
  | "not_needed"
  | "success"
  | "rate_limited"
  | "cooldown"
  | "in_progress"
  | "reauth_required"
  | "upstream_unavailable"
  | "failed";

interface RefreshState {
  requested: boolean;
  attempted: boolean;
  outcome: RefreshOutcome;
  retryAfterSeconds: number | null;
  errorCode: string | null;
  newTrophiesFound: number | null;
}

export function createShareToken(): string {
  return `tb1_${randomBytes(32).toString("base64url")}`;
}

export function isValidShareToken(token: string): boolean {
  return SHARE_TOKEN_PATTERN.test(token);
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function oneHourBefore(date: Date): string {
  return new Date(date.getTime() - 60 * 60 * 1000).toISOString();
}

function filterTrophies(
  trophies: TrophyView[],
  scope: PublicTrophyScope,
  status: PublicTrophyStatus,
): TrophyView[] {
  return trophies.filter((trophy) => {
    const scopeMatches =
      scope === "all" ||
      (scope === "base" && trophy.groupKind === "base") ||
      (scope === "dlc" && trophy.groupKind !== "base");
    const statusMatches =
      status === "all" ||
      (status === "earned" && trophy.earned) ||
      (status === "missing" && !trophy.earned);
    return scopeMatches && statusMatches;
  });
}

function ageSeconds(timestamp: string | null, now: Date): number | null {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / 1000));
}

function completionPercent(earned: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((earned / total) * 10_000) / 100;
}

function hasUsableTrophyState(detail: GameTrophyDetail): boolean {
  return detail.trophies.length > 0;
}

function classifyRefreshError(error: unknown): Pick<RefreshState, "outcome" | "retryAfterSeconds" | "errorCode"> {
  if (error instanceof TrophySyncError) {
    if (error.code === "SYNC_COOLDOWN") {
      return {
        outcome: "cooldown",
        retryAfterSeconds: error.retryAfterSeconds,
        errorCode: error.code,
      };
    }
    if (error.code === "SYNC_IN_PROGRESS") {
      return { outcome: "in_progress", retryAfterSeconds: null, errorCode: error.code };
    }
    return { outcome: "failed", retryAfterSeconds: null, errorCode: error.code };
  }

  if (error instanceof PsnConnectionError) {
    if (error.code === "REAUTH_REQUIRED") {
      return { outcome: "reauth_required", retryAfterSeconds: null, errorCode: error.code };
    }
    if (error.code === "UPSTREAM_UNAVAILABLE" || error.code === "INVALID_RESPONSE") {
      return {
        outcome: "upstream_unavailable",
        retryAfterSeconds: null,
        errorCode: error.code,
      };
    }
    return { outcome: "failed", retryAfterSeconds: null, errorCode: error.code };
  }

  if (error instanceof PsnProviderError) {
    return {
      outcome: "upstream_unavailable",
      retryAfterSeconds: null,
      errorCode: `PSN_${error.code}`,
    };
  }

  return { outcome: "failed", retryAfterSeconds: null, errorCode: "SYNC_FAILED" };
}

export class ShareService {
  constructor(
    private readonly accounts: SharingAccountReader,
    private readonly repository: SharingRepository,
    private readonly trophies: TrophyRepository,
    private readonly refresher: PublicGameRefresher,
    private readonly aiPolicy: AiContextPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOwnerStatus(ownerUserId: string): Promise<OwnerShareStatus> {
    const account = await this.requireOwnerAccount(ownerUserId);
    return this.repository.getActiveLink(account.id);
  }

  async rotateOwnerLink(ownerUserId: string): Promise<RotatedShareLink> {
    const account = await this.requireOwnerAccount(ownerUserId);
    const token = createShareToken();
    const createdAt = this.now().toISOString();
    const status = await this.repository.rotateActiveLink(
      account.id,
      hashShareToken(token),
      createdAt,
    );
    return { ...status, token };
  }

  async revokeOwnerLink(ownerUserId: string): Promise<OwnerShareStatus> {
    const account = await this.requireOwnerAccount(ownerUserId);
    return this.repository.revokeActiveLink(account.id, this.now().toISOString());
  }

  async getDiscovery(token: string) {
    const share = await this.resolve(token);
    const page = await this.repository.listVisibleGames(share.psnAccountId, 1, 0);
    return {
      schema_version: "1.0",
      account: {
        online_id: share.onlineId,
        preferred_locale: share.preferredLocale,
      },
      library: {
        visible_games: page.totalCount,
      },
      sync: {
        last_successful_sync_at: share.lastSuccessfulSyncAt,
      },
      capabilities: {
        games: true,
        game_detail: true,
        trophies: true,
        ai_context: true,
        refresh: true,
      },
      endpoints: {
        games: "./games",
        game: "./games/{gameId}",
        trophies: "./games/{gameId}/trophies",
        ai_context: "./games/{gameId}/ai-context",
      },
    };
  }

  async listGames(token: string, limit: number, offset: number) {
    const share = await this.resolve(token);
    const page = await this.repository.listVisibleGames(share.psnAccountId, limit, offset);
    const nextOffset = offset + page.games.length < page.totalCount ? offset + page.games.length : null;

    return {
      schema_version: "1.0",
      total_count: page.totalCount,
      count: page.games.length,
      offset,
      limit,
      next_offset: nextOffset,
      games: page.games.map((game) => this.serializeGame(game)),
    };
  }

  async getGame(token: string, gameId: string) {
    const share = await this.resolve(token);
    await this.requireVisibleGame(share.psnAccountId, gameId);
    const detail = await this.trophies.getGameDetail(share.psnAccountId, gameId);
    if (!detail) throw new ShareError("GAME_NOT_FOUND");

    return {
      schema_version: "1.0",
      game: {
        game_id: detail.gameId,
        title: detail.title,
        platforms: detail.platforms,
        icon_url: detail.iconUrl,
        library_progress_percent: detail.libraryProgressPercent,
        last_trophy_sync_at: detail.lastTrophySyncAt,
        hydrated: detail.trophies.length > 0,
        base: {
          total_count: detail.base.totalCount,
          earned_count: detail.base.earnedCount,
          platinum_total: detail.base.platinumTotal,
          platinum_earned: detail.base.platinumEarned,
        },
        additional: {
          total_count: detail.additional.totalCount,
          earned_count: detail.additional.earnedCount,
        },
        groups: detail.groups.map((group) => ({
          group_id: group.groupId,
          scope: group.kind === "base" ? "base" : "additional",
          name: group.name,
          icon_url: group.iconUrl,
          total_count: group.totalCount,
          earned_count: group.earnedCount,
        })),
      },
    };
  }

  async getTrophies(
    token: string,
    gameId: string,
    scope: PublicTrophyScope,
    status: PublicTrophyStatus,
  ) {
    const share = await this.resolve(token);
    await this.requireVisibleGame(share.psnAccountId, gameId);
    const detail = await this.trophies.getGameDetail(share.psnAccountId, gameId);
    if (!detail) throw new ShareError("GAME_NOT_FOUND");

    const selected: PublicTrophyItem[] = filterTrophies(detail.trophies, scope, status).map(
      toPublicTrophy,
    );

    return {
      schema_version: "1.0",
      game: {
        game_id: detail.gameId,
        title: detail.title,
      },
      filters: { scope, status },
      count: selected.length,
      trophies: selected,
    };
  }

  async getAiContext(token: string, gameId: string, freshRequested: boolean) {
    const share = await this.resolve(token);
    await this.requireVisibleGame(share.psnAccountId, gameId);

    let detail = await this.trophies.getGameDetail(share.psnAccountId, gameId);
    if (!detail) throw new ShareError("GAME_NOT_FOUND");

    const initialUsableState = hasUsableTrophyState(detail);
    const requestedAt = this.now();
    const initialAge = ageSeconds(detail.lastTrophySyncAt, requestedAt);
    const staleBeforeRefresh =
      initialAge == null || initialAge >= this.aiPolicy.freshnessSeconds;

    let refresh: RefreshState = {
      requested: freshRequested,
      attempted: false,
      outcome: freshRequested ? "not_needed" : "not_requested",
      retryAfterSeconds: null,
      errorCode: null,
      newTrophiesFound: null,
    };

    if (freshRequested && staleBeforeRefresh) {
      const claim = await this.repository.claimAiRefresh(
        share.linkId,
        requestedAt.toISOString(),
        AI_REFRESH_WINDOW_SECONDS,
        this.aiPolicy.maxRefreshesPerHour,
      );

      if (!claim.allowed) {
        refresh = {
          ...refresh,
          outcome: "rate_limited",
          retryAfterSeconds: claim.retryAfterSeconds,
        };
      } else {
        refresh = { ...refresh, attempted: true };
        try {
          const summary = await this.refresher.sync(share.ownerUserId, gameId);
          refresh = {
            ...refresh,
            outcome: "success",
            newTrophiesFound: summary.newTrophiesFound,
          };
          const refreshed = await this.trophies.getGameDetail(share.psnAccountId, gameId);
          if (refreshed) detail = refreshed;
        } catch (error) {
          const failure = classifyRefreshError(error);
          refresh = { ...refresh, ...failure };

          if (!initialUsableState) {
            if (failure.outcome === "upstream_unavailable") {
              throw new ShareError("PSN_UNAVAILABLE", { retryable: true });
            }
            if (failure.outcome === "reauth_required") {
              throw new ShareError("PSN_REAUTH_REQUIRED");
            }
            if (failure.outcome === "failed") {
              throw new ShareError("SYNC_FAILED", { retryable: true });
            }
          }
        }
      }
    }

    const generatedAt = this.now();
    const currentAge = ageSeconds(detail.lastTrophySyncAt, generatedAt);
    const isFresh = currentAge != null && currentAge < this.aiPolicy.freshnessSeconds;
    const baseMissing = detail.trophies.filter(
      (trophy) => trophy.groupKind === "base" && !trophy.earned,
    );
    const includedMissing = baseMissing.slice(0, this.aiPolicy.maxMissingTrophies).map(toPublicTrophy);

    return {
      schema_version: "1.0",
      generated_at: generatedAt.toISOString(),
      identity: {
        online_id: share.onlineId,
        preferred_locale: share.preferredLocale,
        game_id: detail.gameId,
        title: detail.title,
        platforms: detail.platforms,
      },
      progress: {
        hydrated: hasUsableTrophyState(detail),
        library_percent: detail.libraryProgressPercent,
        base: {
          earned_count: detail.base.earnedCount,
          total_count: detail.base.totalCount,
          missing_count: Math.max(0, detail.base.totalCount - detail.base.earnedCount),
          completion_percent: completionPercent(detail.base.earnedCount, detail.base.totalCount),
          platinum_available: detail.base.platinumTotal > 0,
          platinum_earned: detail.base.platinumEarned > 0,
        },
        additional: {
          earned_count: detail.additional.earnedCount,
          total_count: detail.additional.totalCount,
          missing_count: Math.max(0, detail.additional.totalCount - detail.additional.earnedCount),
          completion_percent: completionPercent(
            detail.additional.earnedCount,
            detail.additional.totalCount,
          ),
        },
      },
      missing_trophies: {
        scope: "base",
        count: baseMissing.length,
        included_count: includedMissing.length,
        truncated: includedMissing.length < baseMissing.length,
        items: includedMissing,
      },
      recent_activity: detail.recentEvents.map((event) => ({
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        detected_at: event.detectedAt,
        trophy: {
          psn_trophy_id: event.psnTrophyId,
          name: event.trophyName,
          type: event.trophyType,
          group_id: event.groupId,
          scope: event.groupKind === "base" ? "base" : "additional",
        },
      })),
      sync: {
        last_trophy_sync_at: detail.lastTrophySyncAt,
        age_seconds: currentAge,
        freshness_seconds: this.aiPolicy.freshnessSeconds,
        is_fresh: isFresh,
        refresh_requested: refresh.requested,
        refresh_attempted: refresh.attempted,
        refresh_outcome: refresh.outcome,
        retry_after_seconds: refresh.retryAfterSeconds,
        refresh_error_code: refresh.errorCode,
        new_trophies_found: refresh.newTrophiesFound,
        served_last_good:
          refresh.attempted && refresh.outcome !== "success" && initialUsableState,
      },
      endpoints: {
        game: ".",
        trophies: "./trophies",
      },
    };
  }

  private async resolve(token: string) {
    if (!isValidShareToken(token)) throw new ShareError("INVALID_SHARE_TOKEN");
    const share = await this.repository.resolveByTokenHash(hashShareToken(token));
    if (!share) throw new ShareError("INVALID_SHARE_TOKEN");
    if (!share.active || share.revokedAt) throw new ShareError("SHARE_LINK_REVOKED");

    const now = this.now();
    try {
      await this.repository.touchLink(share.linkId, now.toISOString(), oneHourBefore(now));
    } catch {
      // Usage telemetry is optional and must never make an otherwise valid public read fail.
    }
    return share;
  }

  private async requireOwnerAccount(ownerUserId: string): Promise<PsnAccountRecord> {
    const account = await this.accounts.getAccountForOwner(ownerUserId);
    if (!account) throw new PsnConnectionError("NOT_CONNECTED");
    return account;
  }

  private async requireVisibleGame(psnAccountId: string, gameId: string): Promise<void> {
    const visible = await this.repository.isGameVisible(psnAccountId, gameId);
    if (!visible) throw new ShareError("GAME_NOT_FOUND");
  }

  private serializeGame(game: VisibleGameRecord) {
    return {
      game_id: game.gameId,
      title: game.title,
      platforms: game.platforms,
      icon_url: game.iconUrl,
      progress_percent: game.progressPercent,
      earned: {
        bronze: game.earnedBronze,
        silver: game.earnedSilver,
        gold: game.earnedGold,
        platinum: game.earnedPlatinum,
      },
      total: {
        bronze: game.totalBronze,
        silver: game.totalSilver,
        gold: game.totalGold,
        platinum: game.totalPlatinum,
      },
      psn_last_updated_at: game.psnLastUpdatedAt,
      last_synced_at: game.lastSyncedAt,
    };
  }
}
