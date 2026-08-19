import type { PsnAccountRecord } from "../psn/auth-repository";
import { PsnConnectionError } from "../psn/connection-errors";
import { PsnProviderError } from "../psn/errors";
import type { PsnProvider, PsnTrophy, PsnTrophyGroup, PsnUserTrophy } from "../psn/provider";
import { TrophySyncError } from "./errors";
import type {
  GameSyncPolicy,
  GameSyncSummary,
  GameTrophySnapshot,
  TrophyRepository,
} from "./types";

export interface TrophyAccountReader {
  getAccountForOwner(ownerUserId: string): Promise<PsnAccountRecord | null>;
}

export type TrophyProviderFactory = (ownerUserId: string) => Promise<PsnProvider>;

function addSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function safeRunFailure(error: unknown): { code: string; message: string } {
  if (error instanceof TrophySyncError) return { code: error.code, message: error.message };
  if (error instanceof PsnConnectionError) return { code: error.code, message: error.message };
  if (error instanceof PsnProviderError) {
    return { code: `PSN_${error.code}`, message: "PlayStation Network trophy request failed." };
  }
  return { code: "SYNC_FAILED", message: "Game trophy synchronization failed." };
}

function uniqueBy<T>(items: T[], key: (item: T) => string | number): boolean {
  return new Set(items.map(key)).size === items.length;
}

function validateGroupCounts(groups: PsnTrophyGroup[], trophies: PsnTrophy[]): void {
  const actual = new Map<
    string,
    { bronze: number; silver: number; gold: number; platinum: number }
  >();

  for (const group of groups) {
    actual.set(group.groupId, { bronze: 0, silver: 0, gold: 0, platinum: 0 });
  }
  for (const trophy of trophies) {
    const counts = actual.get(trophy.groupId);
    if (!counts) throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
    counts[trophy.type] += 1;
  }

  for (const group of groups) {
    const counts = actual.get(group.groupId);
    if (
      !counts ||
      counts.bronze !== group.definedTrophies.bronze ||
      counts.silver !== group.definedTrophies.silver ||
      counts.gold !== group.definedTrophies.gold ||
      counts.platinum !== group.definedTrophies.platinum
    ) {
      throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
    }
  }
}

function validateSnapshot(
  groups: PsnTrophyGroup[],
  trophies: PsnTrophy[],
  userTrophies: PsnUserTrophy[],
  policy: GameSyncPolicy,
): GameTrophySnapshot {
  if (
    groups.length > policy.maxGroupsPerSync ||
    trophies.length > policy.maxTrophiesPerSync ||
    userTrophies.length > policy.maxTrophiesPerSync
  ) {
    throw new TrophySyncError("TROPHY_SNAPSHOT_TOO_LARGE");
  }

  if (!uniqueBy(groups, (group) => group.groupId)) {
    throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
  }
  if (!uniqueBy(trophies, (trophy) => trophy.trophyId)) {
    throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
  }
  if (!uniqueBy(userTrophies, (trophy) => trophy.trophyId)) {
    throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
  }

  const baseGroups = groups.filter((group) => group.kind === "base");
  if (baseGroups.length !== 1 || baseGroups[0]?.groupId !== "default") {
    throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
  }

  const groupIds = new Set(groups.map((group) => group.groupId));
  if (trophies.some((trophy) => !groupIds.has(trophy.groupId))) {
    throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
  }
  validateGroupCounts(groups, trophies);

  if (trophies.length !== userTrophies.length) {
    throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
  }

  const titleById = new Map(trophies.map((trophy) => [trophy.trophyId, trophy]));
  for (const userTrophy of userTrophies) {
    const titleTrophy = titleById.get(userTrophy.trophyId);
    if (!titleTrophy || titleTrophy.type !== userTrophy.type) {
      throw new TrophySyncError("INVALID_TROPHY_SNAPSHOT");
    }
  }

  return { groups, trophies, userTrophies };
}

export class TrophySyncService {
  constructor(
    private readonly accounts: TrophyAccountReader,
    private readonly repository: TrophyRepository,
    private readonly createProvider: TrophyProviderFactory,
    private readonly policy: GameSyncPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sync(ownerUserId: string, gameId: string): Promise<GameSyncSummary> {
    const account = await this.accounts.getAccountForOwner(ownerUserId);
    if (!account) throw new PsnConnectionError("NOT_CONNECTED");

    const target = await this.repository.getGameForAccount(account.id, gameId);
    if (!target) throw new TrophySyncError("GAME_NOT_FOUND");

    const startedAtDate = this.now();
    const startedAt = startedAtDate.toISOString();
    const staleBefore = addSeconds(startedAtDate, -this.policy.staleRunAfterSeconds);

    await this.repository.failStaleGameRuns(account.id, gameId, staleBefore, startedAt);
    await this.enforceCooldown(account.id, gameId, startedAtDate);

    const runId = await this.repository.startGameRun(account.id, gameId, startedAt);

    try {
      const provider = await this.createProvider(ownerUserId);
      const groups = await provider.getTrophyGroups(target);
      const trophies = await provider.getTrophies(target);
      const userTrophies = await provider.getUserTrophies(target);
      const snapshot = validateSnapshot(groups, trophies, userTrophies, this.policy);

      const finishedAtDate = this.now();
      const finishedAt = finishedAtDate.toISOString();
      const nextAllowedAt = addSeconds(finishedAtDate, this.policy.minIntervalSeconds);
      const result = await this.repository.persistGameSnapshot(
        account.id,
        gameId,
        snapshot,
        finishedAt,
        nextAllowedAt,
      );

      await this.repository.finishGameRun({
        runId,
        status: "success",
        finishedAt,
        trophiesProcessed: result.processedCount,
      });

      return {
        gameId,
        ...result,
        syncedAt: finishedAt,
        nextAllowedAt,
      };
    } catch (error) {
      const failure = safeRunFailure(error);
      try {
        await this.repository.finishGameRun({
          runId,
          status: "failed",
          finishedAt: this.now().toISOString(),
          trophiesProcessed: 0,
          errorCode: failure.code,
          errorMessage: failure.message,
        });
      } catch {
        // Preserve the original error. A later sync can recover stale run state.
      }
      throw error;
    }
  }

  private async enforceCooldown(psnAccountId: string, gameId: string, now: Date): Promise<void> {
    const latest = await this.repository.getLatestSuccessfulGameRun(psnAccountId, gameId);
    if (!latest?.finishedAt) return;

    const nextAllowedAt =
      new Date(latest.finishedAt).getTime() + this.policy.minIntervalSeconds * 1000;
    const remainingMs = nextAllowedAt - now.getTime();
    if (remainingMs <= 0) return;

    throw new TrophySyncError("SYNC_COOLDOWN", {
      retryable: true,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    });
  }
}
