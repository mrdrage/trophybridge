import { createHash, randomBytes } from "node:crypto";

import type { PsnAccountRecord } from "../psn/auth-repository";
import { PsnConnectionError } from "../psn/connection-errors";
import type { TrophyRepository, TrophyView } from "../trophies/types";
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

export interface SharingAccountReader {
  getAccountForOwner(ownerUserId: string): Promise<PsnAccountRecord | null>;
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

export class ShareService {
  constructor(
    private readonly accounts: SharingAccountReader,
    private readonly repository: SharingRepository,
    private readonly trophies: TrophyRepository,
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
        ai_context: false,
        refresh: false,
      },
      endpoints: {
        games: "./games",
        game: "./games/{gameId}",
        trophies: "./games/{gameId}/trophies",
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
