import type { PsnGame } from "../psn/provider";

export interface LibrarySyncPolicy {
  minIntervalSeconds: number;
  maxGamesPerSync: number;
  staleRunAfterSeconds: number;
}

export interface LibrarySyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface PersistLibraryResult {
  processedCount: number;
  discoveredCount: number;
}

export interface LibraryGameView {
  id: string;
  title: string;
  platforms: string[];
  iconUrl: string | null;
  communicationId: string;
  serviceName: string;
  progressPercent: number | null;
  earnedBronze: number;
  earnedSilver: number;
  earnedGold: number;
  earnedPlatinum: number;
  totalBronze: number;
  totalSilver: number;
  totalGold: number;
  totalPlatinum: number;
  hidden: boolean;
  psnLastUpdatedAt: string | null;
  lastSyncedAt: string | null;
}

export interface LibraryOverview {
  totalCount: number;
  games: LibraryGameView[];
}

export interface LibrarySyncSummary {
  processedCount: number;
  discoveredCount: number;
  syncedAt: string;
  nextAllowedAt: string;
}

export interface LibraryRepository {
  failStaleLibraryRuns(
    psnAccountId: string,
    staleBefore: string,
    finishedAt: string,
  ): Promise<void>;
  getLatestSuccessfulLibraryRun(psnAccountId: string): Promise<LibrarySyncRun | null>;
  startLibraryRun(psnAccountId: string, startedAt: string): Promise<string>;
  finishLibraryRun(input: {
    runId: string;
    status: "success" | "failed";
    finishedAt: string;
    gamesProcessed: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void>;
  persistLibrarySnapshot(
    psnAccountId: string,
    games: PsnGame[],
    seenAt: string,
  ): Promise<PersistLibraryResult>;
  getOverview(psnAccountId: string, limit?: number): Promise<LibraryOverview>;
}
