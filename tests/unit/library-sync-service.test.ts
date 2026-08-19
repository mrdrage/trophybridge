import { describe, expect, it } from "vitest";

import { LibrarySyncError } from "../../lib/library/errors";
import { LibrarySyncService } from "../../lib/library/service";
import type {
  LibraryOverview,
  LibraryRepository,
  LibrarySyncRun,
  PersistLibraryResult,
} from "../../lib/library/types";
import { PsnProviderError } from "../../lib/psn/errors";
import type { PsnAccountRecord } from "../../lib/psn/auth-repository";
import type { PsnGame, PsnProvider } from "../../lib/psn/provider";

const account: PsnAccountRecord = {
  id: "psn-account-row",
  ownerUserId: "owner-1",
  psnOnlineId: "mrdrage2",
  psnAccountId: "123456789",
  authStatus: "connected",
  preferredLocale: "it-IT",
};

const game: PsnGame = {
  communicationId: "NPWR00001_00",
  serviceName: "trophy2",
  title: "Fixture XVI",
  platforms: ["PS5"],
  progressPercent: 42,
  iconUrl: "https://example.invalid/game.png",
  definedTrophies: { bronze: 40, silver: 6, gold: 3, platinum: 1 },
  earnedTrophies: { bronze: 14, silver: 2, gold: 1, platinum: 0 },
  lastUpdatedAt: "2026-08-19T09:00:00Z",
  hidden: false,
};

class MemoryLibraryRepository implements LibraryRepository {
  latest: LibrarySyncRun | null = null;
  started = 0;
  finished: Array<{ status: string; gamesProcessed: number; errorCode?: string | null }> = [];
  persisted: PsnGame[] | null = null;
  result: PersistLibraryResult = { processedCount: 1, discoveredCount: 1 };

  async failStaleLibraryRuns() {}
  async getLatestSuccessfulLibraryRun() {
    return this.latest;
  }
  async startLibraryRun() {
    this.started += 1;
    return "run-1";
  }
  async finishLibraryRun(input: {
    runId: string;
    status: "success" | "failed";
    finishedAt: string;
    gamesProcessed: number;
    errorCode?: string | null;
  }) {
    this.finished.push({
      status: input.status,
      gamesProcessed: input.gamesProcessed,
      errorCode: input.errorCode,
    });
  }
  async persistLibrarySnapshot(_accountId: string, games: PsnGame[]) {
    this.persisted = games;
    return this.result;
  }
  async getOverview(): Promise<LibraryOverview> {
    return { totalCount: 0, games: [] };
  }
}

function provider(games: PsnGame[]): PsnProvider {
  return {
    getAccount: async () => ({ accountId: account.psnAccountId, onlineId: account.psnOnlineId }),
    getGames: async () => games,
    getTrophyGroups: async () => [],
    getTrophies: async () => [],
    getUserTrophies: async () => [],
  };
}

function service(
  repository: MemoryLibraryRepository,
  games: PsnGame[] = [game],
  now = new Date("2026-08-19T12:00:00Z"),
) {
  return new LibrarySyncService(
    { getAccountForOwner: async (owner) => (owner === account.ownerUserId ? account : null) },
    repository,
    async () => provider(games),
    { minIntervalSeconds: 3600, maxGamesPerSync: 2000, staleRunAfterSeconds: 600 },
    () => now,
  );
}

describe("LibrarySyncService", () => {
  it("persists one normalized library snapshot and records a successful run", async () => {
    const repository = new MemoryLibraryRepository();

    const summary = await service(repository).sync("owner-1");

    expect(repository.persisted).toEqual([game]);
    expect(repository.started).toBe(1);
    expect(repository.finished).toEqual([
      { status: "success", gamesProcessed: 1, errorCode: undefined },
    ]);
    expect(summary).toMatchObject({ processedCount: 1, discoveredCount: 1 });
    expect(summary.nextAllowedAt).toBe("2026-08-19T13:00:00.000Z");
  });

  it("enforces the one-hour free-tier cooldown before contacting PSN", async () => {
    const repository = new MemoryLibraryRepository();
    repository.latest = {
      id: "previous",
      startedAt: "2026-08-19T11:20:00Z",
      finishedAt: "2026-08-19T11:30:00Z",
    };

    await expect(service(repository).sync("owner-1")).rejects.toMatchObject({
      code: "SYNC_COOLDOWN",
      retryAfterSeconds: 1800,
    });
    expect(repository.started).toBe(0);
    expect(repository.persisted).toBeNull();
  });

  it("fails closed when a provider response exceeds the configured game budget", async () => {
    const repository = new MemoryLibraryRepository();
    const oversized = [game, { ...game, communicationId: "NPWR00002_00" }];
    const limitedService = new LibrarySyncService(
      { getAccountForOwner: async () => account },
      repository,
      async () => provider(oversized),
      { minIntervalSeconds: 3600, maxGamesPerSync: 1, staleRunAfterSeconds: 600 },
      () => new Date("2026-08-19T12:00:00Z"),
    );

    await expect(limitedService.sync("owner-1")).rejects.toBeInstanceOf(LibrarySyncError);
    expect(repository.persisted).toBeNull();
    expect(repository.finished.at(-1)).toMatchObject({
      status: "failed",
      errorCode: "LIBRARY_TOO_LARGE",
    });
  });

  it("records provider failures without persisting a partial snapshot", async () => {
    const repository = new MemoryLibraryRepository();
    const failingProvider = provider([]);
    failingProvider.getGames = async () => {
      throw new PsnProviderError("RATE_LIMITED", "fixture rate limit", true, 429);
    };
    const sync = new LibrarySyncService(
      { getAccountForOwner: async () => account },
      repository,
      async () => failingProvider,
      { minIntervalSeconds: 3600, maxGamesPerSync: 2000, staleRunAfterSeconds: 600 },
      () => new Date("2026-08-19T12:00:00Z"),
    );

    await expect(sync.sync("owner-1")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(repository.persisted).toBeNull();
    expect(repository.finished.at(-1)).toMatchObject({
      status: "failed",
      errorCode: "PSN_RATE_LIMITED",
    });
  });
});
