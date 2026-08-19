import { describe, expect, it, vi } from "vitest";

import type { PsnAccountRecord } from "../../lib/psn/auth-repository";
import { PsnProviderError } from "../../lib/psn/errors";
import type {
  PsnProvider,
  PsnTrophy,
  PsnTrophyGroup,
  PsnUserTrophy,
} from "../../lib/psn/provider";
import { TrophySyncError } from "../../lib/trophies/errors";
import { TrophySyncService } from "../../lib/trophies/service";
import type {
  GameSyncRun,
  GameSyncTarget,
  GameTrophyDetail,
  GameTrophySnapshot,
  PersistGameSnapshotResult,
  TrophyRepository,
} from "../../lib/trophies/types";

const account: PsnAccountRecord = {
  id: "account-1",
  ownerUserId: "owner-1",
  psnOnlineId: "fixture-player",
  psnAccountId: "123456789",
  authStatus: "connected",
  preferredLocale: "it-IT",
};

const target: GameSyncTarget = {
  gameId: "game-1",
  communicationId: "NPWR99999_00",
  serviceName: "trophy2",
  title: "Fixture Game",
  platforms: ["PS5"],
};

const groups: PsnTrophyGroup[] = [
  {
    groupId: "default",
    kind: "base",
    name: "Fixture Game",
    iconUrl: null,
    definedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 1 },
  },
  {
    groupId: "001",
    kind: "dlc",
    name: "Extra",
    iconUrl: null,
    definedTrophies: { bronze: 1, silver: 0, gold: 0, platinum: 0 },
  },
];

const trophies: PsnTrophy[] = [
  {
    trophyId: 0,
    groupId: "default",
    name: "Base Bronze",
    description: "Earn the bronze.",
    type: "bronze",
    hidden: false,
    iconUrl: null,
  },
  {
    trophyId: 1,
    groupId: "default",
    name: "Platinum",
    description: "Earn all base trophies.",
    type: "platinum",
    hidden: false,
    iconUrl: null,
  },
  {
    trophyId: 2,
    groupId: "001",
    name: "Extra Bronze",
    description: null,
    type: "bronze",
    hidden: false,
    iconUrl: null,
  },
];

const userTrophies: PsnUserTrophy[] = [
  {
    trophyId: 0,
    type: "bronze",
    hidden: false,
    earned: true,
    earnedAt: "2026-08-19T10:00:00Z",
    rarity: "common",
    earnedRate: 60,
    progressValue: null,
    progressTarget: null,
    progressPercent: 100,
  },
  {
    trophyId: 1,
    type: "platinum",
    hidden: false,
    earned: false,
    earnedAt: null,
    rarity: "rare",
    earnedRate: 10,
    progressValue: null,
    progressTarget: null,
    progressPercent: null,
  },
  {
    trophyId: 2,
    type: "bronze",
    hidden: false,
    earned: true,
    earnedAt: "2026-08-19T11:00:00Z",
    rarity: "common",
    earnedRate: 70,
    progressValue: null,
    progressTarget: null,
    progressPercent: 100,
  },
];

class MemoryRepository implements TrophyRepository {
  latest: GameSyncRun | null = null;
  persisted: GameTrophySnapshot | null = null;
  persistedRunId: string | null = null;
  runStatus: "running" | "success" | "failed" | null = null;
  finishedNewTrophiesFound: number | null = null;
  target: GameSyncTarget | null = target;
  nextNewTrophiesFound = 0;

  async getGameForAccount() {
    return this.target;
  }

  async failStaleGameRuns() {}

  async getLatestSuccessfulGameRun() {
    return this.latest;
  }

  async startGameRun() {
    this.runStatus = "running";
    return "run-1";
  }

  async finishGameRun(input: {
    status: "success" | "failed";
    newTrophiesFound?: number;
  }) {
    this.runStatus = input.status;
    this.finishedNewTrophiesFound = input.newTrophiesFound ?? 0;
  }

  async persistGameSnapshot(
    _psnAccountId: string,
    _gameId: string,
    runId: string,
    snapshot: GameTrophySnapshot,
  ): Promise<PersistGameSnapshotResult> {
    this.persisted = snapshot;
    this.persistedRunId = runId;
    const groupKind = new Map(snapshot.groups.map((group) => [group.groupId, group.kind]));
    const userById = new Map(snapshot.userTrophies.map((trophy) => [trophy.trophyId, trophy]));
    const base = snapshot.trophies.filter((trophy) => groupKind.get(trophy.groupId) === "base");
    const additional = snapshot.trophies.filter(
      (trophy) => groupKind.get(trophy.groupId) !== "base",
    );
    return {
      processedCount: snapshot.trophies.length,
      earnedCount: snapshot.trophies.filter((trophy) => userById.get(trophy.trophyId)?.earned).length,
      baseTrophyCount: base.length,
      baseEarnedCount: base.filter((trophy) => userById.get(trophy.trophyId)?.earned).length,
      additionalTrophyCount: additional.length,
      additionalEarnedCount: additional.filter(
        (trophy) => userById.get(trophy.trophyId)?.earned,
      ).length,
      newTrophiesFound: this.nextNewTrophiesFound,
    };
  }

  async getGameDetail(): Promise<GameTrophyDetail | null> {
    return null;
  }
}

function provider(overrides: Partial<PsnProvider> = {}): PsnProvider {
  return {
    getAccount: async () => ({ accountId: "123456789", onlineId: "fixture-player" }),
    getGames: async () => [],
    getTrophyGroups: async () => groups,
    getTrophies: async () => trophies,
    getUserTrophies: async () => userTrophies,
    ...overrides,
  };
}

function service(
  repository: MemoryRepository,
  psnProvider: PsnProvider = provider(),
  now = new Date("2026-08-19T12:00:00Z"),
  maxTrophiesPerSync = 1000,
) {
  return new TrophySyncService(
    { getAccountForOwner: async () => account },
    repository,
    async () => psnProvider,
    {
      minIntervalSeconds: 300,
      maxGroupsPerSync: 100,
      maxTrophiesPerSync,
      staleRunAfterSeconds: 600,
    },
    () => now,
  );
}

describe("TrophySyncService", () => {
  it("hydrates exactly one game and separates base from additional trophies", async () => {
    const repository = new MemoryRepository();
    const summary = await service(repository).sync("owner-1", "game-1");

    expect(summary).toMatchObject({
      gameId: "game-1",
      processedCount: 3,
      earnedCount: 2,
      baseTrophyCount: 2,
      baseEarnedCount: 1,
      additionalTrophyCount: 1,
      additionalEarnedCount: 1,
      newTrophiesFound: 0,
    });
    expect(repository.persisted?.groups).toHaveLength(2);
    expect(repository.persistedRunId).toBe("run-1");
    expect(repository.runStatus).toBe("success");
  });

  it("propagates newly detected trophy count to the sync summary and audit run", async () => {
    const repository = new MemoryRepository();
    repository.nextNewTrophiesFound = 2;

    const summary = await service(repository).sync("owner-1", "game-1");

    expect(summary.newTrophiesFound).toBe(2);
    expect(repository.finishedNewTrophiesFound).toBe(2);
  });

  it("rejects a partial title snapshot before any persistence", async () => {
    const repository = new MemoryRepository();
    const partialProvider = provider({ getTrophies: async () => trophies.slice(0, 2) });

    await expect(service(repository, partialProvider).sync("owner-1", "game-1")).rejects.toMatchObject({
      code: "INVALID_TROPHY_SNAPSHOT",
    } satisfies Partial<TrophySyncError>);
    expect(repository.persisted).toBeNull();
    expect(repository.runStatus).toBe("failed");
    expect(repository.finishedNewTrophiesFound).toBe(0);
  });

  it("enforces the per-game cooldown before contacting PSN", async () => {
    const repository = new MemoryRepository();
    repository.latest = {
      id: "old-run",
      startedAt: "2026-08-19T11:58:00Z",
      finishedAt: "2026-08-19T11:59:00Z",
    };
    const getGroups = vi.fn(async () => groups);

    await expect(
      service(repository, provider({ getTrophyGroups: getGroups })).sync("owner-1", "game-1"),
    ).rejects.toMatchObject({ code: "SYNC_COOLDOWN" } satisfies Partial<TrophySyncError>);
    expect(getGroups).not.toHaveBeenCalled();
  });

  it("rejects games outside the synchronized owner library", async () => {
    const repository = new MemoryRepository();
    repository.target = null;

    await expect(service(repository).sync("owner-1", "game-2")).rejects.toMatchObject({
      code: "GAME_NOT_FOUND",
    } satisfies Partial<TrophySyncError>);
    expect(repository.runStatus).toBeNull();
  });

  it("rejects a provider response over the game trophy safety ceiling", async () => {
    const repository = new MemoryRepository();

    await expect(service(repository, provider(), undefined, 2).sync("owner-1", "game-1")).rejects.toMatchObject({
      code: "TROPHY_SNAPSHOT_TOO_LARGE",
    } satisfies Partial<TrophySyncError>);
    expect(repository.persisted).toBeNull();
  });

  it("preserves last-good persistence when PSN fails during hydration", async () => {
    const repository = new MemoryRepository();
    const failing = provider({
      getUserTrophies: async () => {
        throw new PsnProviderError(
          "UPSTREAM_UNAVAILABLE",
          "Fixture upstream failure",
          true,
        );
      },
    });

    await expect(service(repository, failing).sync("owner-1", "game-1")).rejects.toBeInstanceOf(
      PsnProviderError,
    );
    expect(repository.persisted).toBeNull();
    expect(repository.runStatus).toBe("failed");
    expect(repository.finishedNewTrophiesFound).toBe(0);
  });
});
