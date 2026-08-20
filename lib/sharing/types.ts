import type { TrophyView } from "../trophies/types";

export interface OwnerShareStatus {
  active: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface RotatedShareLink extends OwnerShareStatus {
  token: string;
}

export interface ResolvedShareLink {
  linkId: string;
  psnAccountId: string;
  onlineId: string;
  preferredLocale: string;
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  active: boolean;
  revokedAt: string | null;
}

export interface VisibleGameRecord {
  gameId: string;
  title: string;
  platforms: string[];
  iconUrl: string | null;
  progressPercent: number | null;
  earnedBronze: number;
  earnedSilver: number;
  earnedGold: number;
  earnedPlatinum: number;
  totalBronze: number;
  totalSilver: number;
  totalGold: number;
  totalPlatinum: number;
  psnLastUpdatedAt: string | null;
  lastSyncedAt: string | null;
}

export interface VisibleGamePage {
  totalCount: number;
  games: VisibleGameRecord[];
}

export type PublicTrophyScope = "base" | "dlc" | "all";
export type PublicTrophyStatus = "earned" | "missing" | "all";

export interface PublicTrophyItem {
  psn_trophy_id: number;
  group_id: string;
  scope: "base" | "additional";
  name: string | null;
  description: string | null;
  type: "bronze" | "silver" | "gold" | "platinum";
  hidden: boolean;
  spoiler_masked: boolean;
  icon_url: string | null;
  rarity: string | null;
  earned_rate: number | null;
  earned: boolean;
  earned_at: string | null;
  progress_value: number | null;
  progress_target: number | null;
  progress_percent: number | null;
}

export interface SharingRepository {
  getActiveLink(psnAccountId: string): Promise<OwnerShareStatus>;
  rotateActiveLink(
    psnAccountId: string,
    tokenHash: string,
    createdAt: string,
  ): Promise<OwnerShareStatus>;
  revokeActiveLink(psnAccountId: string, revokedAt: string): Promise<OwnerShareStatus>;
  resolveByTokenHash(tokenHash: string): Promise<ResolvedShareLink | null>;
  touchLink(linkId: string, usedAt: string, olderThan: string): Promise<void>;
  listVisibleGames(psnAccountId: string, limit: number, offset: number): Promise<VisibleGamePage>;
  isGameVisible(psnAccountId: string, gameId: string): Promise<boolean>;
}

export function toPublicTrophy(trophy: TrophyView): PublicTrophyItem {
  const spoilerMasked = trophy.hidden && !trophy.earned;
  return {
    psn_trophy_id: trophy.psnTrophyId,
    group_id: trophy.groupId,
    scope: trophy.groupKind === "base" ? "base" : "additional",
    name: spoilerMasked ? null : trophy.name,
    description: spoilerMasked ? null : trophy.description,
    type: trophy.type,
    hidden: trophy.hidden,
    spoiler_masked: spoilerMasked,
    icon_url: spoilerMasked ? null : trophy.iconUrl,
    rarity: trophy.rarity,
    earned_rate: trophy.earnedRate,
    earned: trophy.earned,
    earned_at: trophy.earnedAt,
    progress_value: trophy.progressValue,
    progress_target: trophy.progressTarget,
    progress_percent: trophy.progressPercent,
  };
}
