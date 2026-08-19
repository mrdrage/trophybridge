export type PsnPlatform = "PS5" | "PS4" | "PS3" | "PSVITA" | "UNKNOWN";
export type PsnServiceName = "trophy" | "trophy2";

export interface PsnTrophyCounts {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface PsnAccount {
  accountId: string;
  onlineId: string;
}

export interface PsnGameRef {
  communicationId: string;
  serviceName: PsnServiceName;
}

export interface PsnGame extends PsnGameRef {
  title: string;
  platforms: PsnPlatform[];
  progressPercent: number | null;
  iconUrl: string | null;
  definedTrophies: PsnTrophyCounts;
  earnedTrophies: PsnTrophyCounts;
  lastUpdatedAt: string | null;
  hidden: boolean;
}

export type PsnTrophyGroupKind = "base" | "dlc" | "unknown";

export interface PsnTrophyGroup {
  groupId: string;
  kind: PsnTrophyGroupKind;
  name: string | null;
  iconUrl: string | null;
  definedTrophies: PsnTrophyCounts;
}

export type PsnTrophyType = "bronze" | "silver" | "gold" | "platinum";
export type PsnTrophyRarity = "ultra_rare" | "very_rare" | "rare" | "common" | "unknown";

export interface PsnTrophy {
  trophyId: number;
  groupId: string;
  name: string | null;
  description: string | null;
  type: PsnTrophyType;
  hidden: boolean;
  iconUrl: string | null;
  rarity: PsnTrophyRarity;
  earnedRate: number | null;
}

export interface PsnUserTrophy {
  trophyId: number;
  earned: boolean;
  earnedAt: string | null;
  progressValue: number | null;
  progressTarget: number | null;
  progressPercent: number | null;
}

export interface PsnProvider {
  getAccount(): Promise<PsnAccount>;
  getGames(): Promise<PsnGame[]>;
  getTrophyGroups(game: PsnGameRef): Promise<PsnTrophyGroup[]>;
  getTrophies(game: PsnGameRef): Promise<PsnTrophy[]>;
  getUserTrophies(game: PsnGameRef): Promise<PsnUserTrophy[]>;
}
