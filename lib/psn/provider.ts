export type PsnPlatform = "PS5" | "PS4" | "PS3" | "PSVITA" | "UNKNOWN";

export interface PsnAccount {
  accountId: string;
  onlineId: string;
}

export interface PsnGameRef {
  communicationId: string;
  serviceName: "trophy" | "trophy2" | string;
}

export interface PsnGame extends PsnGameRef {
  title: string;
  platforms: PsnPlatform[];
  progressPercent: number | null;
  iconUrl: string | null;
}

export interface PsnTrophyGroup {
  groupId: string;
  name: string | null;
  iconUrl: string | null;
}

export type PsnTrophyType = "bronze" | "silver" | "gold" | "platinum";

export interface PsnTrophy {
  trophyId: number;
  groupId: string;
  name: string | null;
  description: string | null;
  type: PsnTrophyType;
  hidden: boolean;
  iconUrl: string | null;
}

export interface PsnUserTrophy {
  trophyId: number;
  earned: boolean;
  earnedAt: string | null;
  progressPercent: number | null;
}

export interface PsnProvider {
  getAccount(): Promise<PsnAccount>;
  getGames(): Promise<PsnGame[]>;
  getTrophyGroups(game: PsnGameRef): Promise<PsnTrophyGroup[]>;
  getTrophies(game: PsnGameRef): Promise<PsnTrophy[]>;
  getUserTrophies(game: PsnGameRef): Promise<PsnUserTrophy[]>;
}
