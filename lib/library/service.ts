import type { PsnAccountRecord } from "../psn/auth-repository";
import { PsnConnectionError } from "../psn/connection-errors";
import { PsnProviderError } from "../psn/errors";
import type { PsnProvider } from "../psn/provider";
import { LibrarySyncError } from "./errors";
import type {
  LibraryRepository,
  LibrarySyncPolicy,
  LibrarySyncSummary,
} from "./types";

export interface LibraryAccountReader {
  getAccountForOwner(ownerUserId: string): Promise<PsnAccountRecord | null>;
}

export type PsnProviderFactory = (ownerUserId: string) => Promise<PsnProvider>;

function addSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function safeRunFailure(error: unknown): { code: string; message: string } {
  if (error instanceof LibrarySyncError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof PsnConnectionError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof PsnProviderError) {
    return { code: `PSN_${error.code}`, message: "PlayStation Network library request failed." };
  }
  return { code: "SYNC_FAILED", message: "Library synchronization failed." };
}

export class LibrarySyncService {
  constructor(
    private readonly accounts: LibraryAccountReader,
    private readonly repository: LibraryRepository,
    private readonly createProvider: PsnProviderFactory,
    private readonly policy: LibrarySyncPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sync(ownerUserId: string): Promise<LibrarySyncSummary> {
    const account = await this.accounts.getAccountForOwner(ownerUserId);
    if (!account) throw new PsnConnectionError("NOT_CONNECTED");

    const startedAtDate = this.now();
    const startedAt = startedAtDate.toISOString();
    const staleBefore = addSeconds(startedAtDate, -this.policy.staleRunAfterSeconds);

    await this.repository.failStaleLibraryRuns(account.id, staleBefore, startedAt);
    await this.enforceCooldown(account.id, startedAtDate);

    const runId = await this.repository.startLibraryRun(account.id, startedAt);

    try {
      const provider = await this.createProvider(ownerUserId);
      const games = await provider.getGames();

      if (games.length > this.policy.maxGamesPerSync) {
        throw new LibrarySyncError("LIBRARY_TOO_LARGE");
      }

      const result = await this.repository.persistLibrarySnapshot(account.id, games, startedAt);
      const finishedAtDate = this.now();
      const finishedAt = finishedAtDate.toISOString();

      await this.repository.finishLibraryRun({
        runId,
        status: "success",
        finishedAt,
        gamesProcessed: result.processedCount,
      });

      return {
        processedCount: result.processedCount,
        discoveredCount: result.discoveredCount,
        syncedAt: finishedAt,
        nextAllowedAt: addSeconds(finishedAtDate, this.policy.minIntervalSeconds),
      };
    } catch (error) {
      const failure = safeRunFailure(error);
      try {
        await this.repository.finishLibraryRun({
          runId,
          status: "failed",
          finishedAt: this.now().toISOString(),
          gamesProcessed: 0,
          errorCode: failure.code,
          errorMessage: failure.message,
        });
      } catch {
        // Preserve the original failure. A later run can recover stale state safely.
      }
      throw error;
    }
  }

  private async enforceCooldown(psnAccountId: string, now: Date): Promise<void> {
    const latest = await this.repository.getLatestSuccessfulLibraryRun(psnAccountId);
    if (!latest?.finishedAt) return;

    const nextAllowedAt = new Date(latest.finishedAt).getTime() + this.policy.minIntervalSeconds * 1000;
    const remainingMs = nextAllowedAt - now.getTime();
    if (remainingMs <= 0) return;

    throw new LibrarySyncError("SYNC_COOLDOWN", {
      retryable: true,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    });
  }
}
