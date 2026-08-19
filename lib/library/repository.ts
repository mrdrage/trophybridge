import type { SupabaseClient } from "@supabase/supabase-js";

import type { PsnGame } from "../psn/provider";
import { LibrarySyncError } from "./errors";
import type {
  LibraryGameView,
  LibraryOverview,
  LibraryRepository,
  LibrarySyncRun,
  PersistLibraryResult,
} from "./types";

const overviewSelect = [
  "game_id",
  "progress_percent",
  "earned_bronze",
  "earned_silver",
  "earned_gold",
  "earned_platinum",
  "total_bronze",
  "total_silver",
  "total_gold",
  "total_platinum",
  "is_hidden",
  "psn_last_updated_at",
  "last_synced_at",
  "games!inner(id,np_communication_id,np_service_name,title_name,platforms,icon_url)",
].join(",");

function storageFailure(): never {
  throw new LibrarySyncError("STORAGE_ERROR");
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapOverviewRow(row: Record<string, unknown>): LibraryGameView {
  const gameValue = row.games;
  const game = Array.isArray(gameValue) ? gameValue[0] : gameValue;
  if (!game || typeof game !== "object") storageFailure();
  const gameRow = game as Record<string, unknown>;

  if (
    typeof gameRow.id !== "string" ||
    typeof gameRow.np_communication_id !== "string" ||
    typeof gameRow.np_service_name !== "string" ||
    typeof gameRow.title_name !== "string"
  ) {
    storageFailure();
  }

  const platforms = Array.isArray(gameRow.platforms)
    ? gameRow.platforms.filter((value): value is string => typeof value === "string")
    : [];

  return {
    id: gameRow.id as string,
    title: gameRow.title_name as string,
    platforms,
    iconUrl: nullableString(gameRow.icon_url),
    communicationId: gameRow.np_communication_id as string,
    serviceName: gameRow.np_service_name as string,
    progressPercent: nullableNumber(row.progress_percent),
    earnedBronze: numberValue(row.earned_bronze),
    earnedSilver: numberValue(row.earned_silver),
    earnedGold: numberValue(row.earned_gold),
    earnedPlatinum: numberValue(row.earned_platinum),
    totalBronze: numberValue(row.total_bronze),
    totalSilver: numberValue(row.total_silver),
    totalGold: numberValue(row.total_gold),
    totalPlatinum: numberValue(row.total_platinum),
    hidden: row.is_hidden === true,
    psnLastUpdatedAt: nullableString(row.psn_last_updated_at),
    lastSyncedAt: nullableString(row.last_synced_at),
  };
}

export class SupabaseLibraryRepository implements LibraryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async failStaleLibraryRuns(
    psnAccountId: string,
    staleBefore: string,
    finishedAt: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_code: "SYNC_STALE",
        error_message: "Stale library synchronization recovered safely.",
      })
      .eq("psn_account_id", psnAccountId)
      .eq("sync_type", "library")
      .eq("status", "running")
      .lt("started_at", staleBefore);

    if (error) storageFailure();
  }

  async getLatestSuccessfulLibraryRun(psnAccountId: string): Promise<LibrarySyncRun | null> {
    const { data, error } = await this.client
      .from("sync_runs")
      .select("id, started_at, finished_at")
      .eq("psn_account_id", psnAccountId)
      .eq("sync_type", "library")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) storageFailure();
    if (!data) return null;

    const row = data as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.started_at !== "string") storageFailure();

    return {
      id: row.id,
      startedAt: row.started_at,
      finishedAt: nullableString(row.finished_at),
    };
  }

  async startLibraryRun(psnAccountId: string, startedAt: string): Promise<string> {
    const { data, error } = await this.client
      .from("sync_runs")
      .insert({
        psn_account_id: psnAccountId,
        sync_type: "library",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new LibrarySyncError("SYNC_IN_PROGRESS", { retryable: true });
      }
      storageFailure();
    }
    if (!data || typeof (data as Record<string, unknown>).id !== "string") storageFailure();
    return (data as { id: string }).id;
  }

  async finishLibraryRun(input: {
    runId: string;
    status: "success" | "failed";
    finishedAt: string;
    gamesProcessed: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const { error } = await this.client
      .from("sync_runs")
      .update({
        status: input.status,
        finished_at: input.finishedAt,
        games_processed: input.gamesProcessed,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
      })
      .eq("id", input.runId);

    if (error) storageFailure();
  }

  async persistLibrarySnapshot(
    psnAccountId: string,
    games: PsnGame[],
    seenAt: string,
  ): Promise<PersistLibraryResult> {
    const { data, error } = await this.client.rpc("persist_library_snapshot", {
      p_psn_account_id: psnAccountId,
      p_games: games,
      p_seen_at: seenAt,
    });

    if (error) storageFailure();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") storageFailure();
    const result = row as Record<string, unknown>;

    return {
      processedCount: numberValue(result.processed_count),
      discoveredCount: numberValue(result.discovered_count),
    };
  }

  async getOverview(psnAccountId: string, limit = 12): Promise<LibraryOverview> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
    const { data, error, count } = await this.client
      .from("account_games")
      .select(overviewSelect, { count: "exact" })
      .eq("psn_account_id", psnAccountId)
      .order("last_seen_at", { ascending: false })
      .limit(boundedLimit);

    if (error) storageFailure();
    const rows = Array.isArray(data) ? data : [];

    return {
      totalCount: typeof count === "number" ? count : rows.length,
      games: rows.map((row) => mapOverviewRow(row as Record<string, unknown>)),
    };
  }
}
