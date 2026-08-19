import type {
  PsnGameRef,
  PsnTrophy,
  PsnTrophyGroup,
  PsnUserTrophy,
} from "../psn/provider";

export interface GameSyncPolicy {
  minIntervalSeconds: number;
  maxGroupsPerSync: number;
  maxTrophiesPerSync: number;
  staleRunAfterSeconds: number;
}

export interface GameSyncTarget extends PsnGameRef {
  gameId: string;
  title: string;
  platforms: string[];
}

export interface GameSyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface PersistGameSnapshotResult {
  processedCount: number;
  earnedCount: number;
  baseTrophyCount: number;
  baseEarnedCount: number;
  additionalTrophyCount: number;
  additionalEarnedCount: number;
}

export interface GameSyncSummary extends PersistGameSnapshotResult {
  gameId: string;
  syncedAt: string;
  nextAllowedAt: string;
}

export interface TrophyGroupView {
  id: string;
  groupId: string;
  kind: "base" | "dlc" | "unknown";
  name: string | null;
  iconUrl: string | null;
  totalCount: number;
  earnedCount: number;
}

export interface TrophyView {
  id: string;
  psnTrophyId: number;
  groupId: string;
  groupKind: "base" | "dlc" | "unknown";
  name: string | null;
  description: string | null;
  type: "bronze" | "silver" | "gold" | "platinum";
  hidden: boolean;
  iconUrl: string | null;
  rarity: string | null;
  earnedRate: number | null;
  earned: boolean;
  earnedAt: string | null;
  progressValue: number | null;
  progressTarget: number | null;
  progressPercent: number | null;
}

export interface GameTrophyDetail {
  gameId: string;
  title: string;
  platforms: string[];
  iconUrl: string | null;
  libraryProgressPercent: number | null;
  lastTrophySyncAt: string | null;
  base: {
    totalCount: number;
    earnedCount: number;
    platinumTotal: number;
    platinumEarned: number;
  };
  additional: {
    totalCount: number;
    earnedCount: number;
  };
  groups: TrophyGroupView[];
  trophies: TrophyView[];
}

export interface GameTrophySnapshot {
  groups: PsnTrophyGroup[];
  trophies: PsnTrophy[];
  userTrophies: PsnUserTrophy[];
}

export interface TrophyRepository {
  getGameForAccount(psnAccountId: string, gameId: string): Promise<GameSyncTarget | null>;
  failStaleGameRuns(
    psnAccountId: string,
    gameId: string,
    staleBefore: string,
    finishedAt: string,
  ): Promise<void>;
  getLatestSuccessfulGameRun(
    psnAccountId: string,
    gameId: string,
  ): Promise<GameSyncRun | null>;
  startGameRun(psnAccountId: string, gameId: string, startedAt: string): Promise<string>;
  finishGameRun(input: {
    runId: string;
    status: "success" | "failed";
    finishedAt: string;
    trophiesProcessed: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void>;
  persistGameSnapshot(
    psnAccountId: string,
    gameId: string,
    snapshot: GameTrophySnapshot,
    seenAt: string,
    nextAllowedAt: string,
  ): Promise<PersistGameSnapshotResult>;
  getGameDetail(psnAccountId: string, gameId: string): Promise<GameTrophyDetail | null>;
}
