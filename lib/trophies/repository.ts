import type { SupabaseClient } from "@supabase/supabase-js";

import { TrophySyncError } from "./errors";
import type {
  GameSyncRun,
  GameSyncTarget,
  GameTrophyDetail,
  GameTrophySnapshot,
  PersistGameSnapshotResult,
  ProgressEventView,
  TrophyGroupView,
  TrophyRepository,
  TrophyView,
} from "./types";

function storageFailure(): never {
  throw new TrophySyncError("STORAGE_ERROR");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function groupKind(value: unknown): "base" | "dlc" | "unknown" {
  return value === "base" || value === "dlc" || value === "unknown" ? value : "unknown";
}

function trophyType(value: unknown): "bronze" | "silver" | "gold" | "platinum" {
  if (value === "bronze" || value === "silver" || value === "gold" || value === "platinum") {
    return value;
  }
  storageFailure();
}

function progressEventType(value: unknown): "trophy_earned" | "platinum_earned" {
  if (value === "trophy_earned" || value === "platinum_earned") return value;
  storageFailure();
}

export class SupabaseTrophyRepository implements TrophyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getGameForAccount(psnAccountId: string, gameId: string): Promise<GameSyncTarget | null> {
    const { data, error } = await this.client
      .from("account_games")
      .select(
        "game_id,games!inner(id,np_communication_id,np_service_name,title_name,platforms)",
      )
      .eq("psn_account_id", psnAccountId)
      .eq("game_id", gameId)
      .maybeSingle();

    if (error) storageFailure();
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    const game = objectValue(row.games);
    if (!game) storageFailure();

    const communicationId = stringValue(game.np_communication_id);
    const serviceName = stringValue(game.np_service_name);
    const title = stringValue(game.title_name);
    if (!communicationId || !title || (serviceName !== "trophy" && serviceName !== "trophy2")) {
      storageFailure();
    }

    return {
      gameId,
      communicationId,
      serviceName,
      title,
      platforms: stringArray(game.platforms),
    };
  }

  async failStaleGameRuns(
    psnAccountId: string,
    gameId: string,
    staleBefore: string,
    finishedAt: string,
  ): Promise<void> {
    const { error } = await this.client
      .from("sync_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error_code: "SYNC_STALE",
        error_message: "Stale game trophy synchronization recovered safely.",
      })
      .eq("psn_account_id", psnAccountId)
      .eq("game_id", gameId)
      .eq("sync_type", "game")
      .eq("status", "running")
      .lt("started_at", staleBefore);

    if (error) storageFailure();
  }

  async getLatestSuccessfulGameRun(
    psnAccountId: string,
    gameId: string,
  ): Promise<GameSyncRun | null> {
    const { data, error } = await this.client
      .from("sync_runs")
      .select("id,started_at,finished_at")
      .eq("psn_account_id", psnAccountId)
      .eq("game_id", gameId)
      .eq("sync_type", "game")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) storageFailure();
    if (!data) return null;
    const row = data as unknown as Record<string, unknown>;
    const id = stringValue(row.id);
    const startedAt = stringValue(row.started_at);
    if (!id || !startedAt) storageFailure();

    return { id, startedAt, finishedAt: stringValue(row.finished_at) };
  }

  async startGameRun(psnAccountId: string, gameId: string, startedAt: string): Promise<string> {
    const { data, error } = await this.client
      .from("sync_runs")
      .insert({
        psn_account_id: psnAccountId,
        game_id: gameId,
        sync_type: "game",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new TrophySyncError("SYNC_IN_PROGRESS", { retryable: true });
      }
      storageFailure();
    }

    const id = objectValue(data)?.id;
    if (typeof id !== "string") storageFailure();
    return id;
  }

  async finishGameRun(input: {
    runId: string;
    status: "success" | "failed";
    finishedAt: string;
    trophiesProcessed: number;
    newTrophiesFound?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const { error } = await this.client
      .from("sync_runs")
      .update({
        status: input.status,
        finished_at: input.finishedAt,
        games_processed: input.status === "success" ? 1 : 0,
        trophies_processed: input.trophiesProcessed,
        new_trophies_found: input.newTrophiesFound ?? 0,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
      })
      .eq("id", input.runId);

    if (error) storageFailure();
  }

  async persistGameSnapshot(
    psnAccountId: string,
    gameId: string,
    runId: string,
    snapshot: GameTrophySnapshot,
    seenAt: string,
    nextAllowedAt: string,
  ): Promise<PersistGameSnapshotResult> {
    const { data, error } = await this.client.rpc("persist_game_trophy_snapshot_with_events", {
      p_psn_account_id: psnAccountId,
      p_game_id: gameId,
      p_sync_run_id: runId,
      p_groups: snapshot.groups,
      p_trophies: snapshot.trophies,
      p_user_trophies: snapshot.userTrophies,
      p_seen_at: seenAt,
      p_next_allowed_at: nextAllowedAt,
    });

    if (error) storageFailure();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") storageFailure();
    const result = row as Record<string, unknown>;

    return {
      processedCount: numberValue(result.processed_count),
      earnedCount: numberValue(result.earned_count),
      baseTrophyCount: numberValue(result.base_trophy_count),
      baseEarnedCount: numberValue(result.base_earned_count),
      additionalTrophyCount: numberValue(result.additional_trophy_count),
      additionalEarnedCount: numberValue(result.additional_earned_count),
      newTrophiesFound: numberValue(result.new_trophies_found),
    };
  }

  async getGameDetail(psnAccountId: string, gameId: string): Promise<GameTrophyDetail | null> {
    const { data: accountGameData, error: accountGameError } = await this.client
      .from("account_games")
      .select(
        "progress_percent,games!inner(id,title_name,platforms,icon_url)",
      )
      .eq("psn_account_id", psnAccountId)
      .eq("game_id", gameId)
      .maybeSingle();

    if (accountGameError) storageFailure();
    if (!accountGameData) return null;

    const accountGame = accountGameData as unknown as Record<string, unknown>;
    const game = objectValue(accountGame.games);
    if (!game) storageFailure();
    const title = stringValue(game.title_name);
    if (!title) storageFailure();

    const { data: groupData, error: groupError } = await this.client
      .from("trophy_groups")
      .select("id,psn_group_id,name,icon_url,kind")
      .eq("game_id", gameId);
    if (groupError) storageFailure();

    const groupRows = (Array.isArray(groupData) ? groupData : []) as Record<string, unknown>[];
    const groupById = new Map<
      string,
      { groupId: string; kind: "base" | "dlc" | "unknown"; name: string | null; iconUrl: string | null }
    >();
    for (const row of groupRows) {
      const id = stringValue(row.id);
      const groupId = stringValue(row.psn_group_id);
      if (!id || !groupId) storageFailure();
      groupById.set(id, {
        groupId,
        kind: groupKind(row.kind),
        name: stringValue(row.name),
        iconUrl: stringValue(row.icon_url),
      });
    }

    const { data: trophyData, error: trophyError } = await this.client
      .from("trophies")
      .select(
        "id,trophy_group_id,psn_trophy_id,name,description,trophy_type,is_hidden,icon_url,rarity,earned_rate",
      )
      .eq("game_id", gameId)
      .order("psn_trophy_id", { ascending: true });
    if (trophyError) storageFailure();

    const { data: stateData, error: stateError } = await this.client
      .from("player_trophies")
      .select(
        "trophy_id,earned,earned_at,progress_value,progress_target,progress_percent,trophies!inner(game_id)",
      )
      .eq("psn_account_id", psnAccountId)
      .eq("trophies.game_id", gameId);
    if (stateError) storageFailure();

    const stateByTrophyId = new Map<string, Record<string, unknown>>();
    for (const row of (Array.isArray(stateData) ? stateData : []) as Record<string, unknown>[]) {
      const trophyId = stringValue(row.trophy_id);
      if (trophyId) stateByTrophyId.set(trophyId, row);
    }

    const trophies: TrophyView[] = [];
    for (const row of (Array.isArray(trophyData) ? trophyData : []) as Record<string, unknown>[]) {
      const id = stringValue(row.id);
      const trophyGroupId = stringValue(row.trophy_group_id);
      if (!id || !trophyGroupId) storageFailure();
      const group = groupById.get(trophyGroupId);
      if (!group) storageFailure();
      const state = stateByTrophyId.get(id);

      trophies.push({
        id,
        psnTrophyId: numberValue(row.psn_trophy_id),
        groupId: group.groupId,
        groupKind: group.kind,
        name: stringValue(row.name),
        description: stringValue(row.description),
        type: trophyType(row.trophy_type),
        hidden: row.is_hidden === true,
        iconUrl: stringValue(row.icon_url),
        rarity: stringValue(row.rarity),
        earnedRate: nullableNumber(row.earned_rate),
        earned: state?.earned === true,
        earnedAt: stringValue(state?.earned_at),
        progressValue: nullableNumber(state?.progress_value),
        progressTarget: nullableNumber(state?.progress_target),
        progressPercent: nullableNumber(state?.progress_percent),
      });
    }

    trophies.sort((left, right) => {
      if (left.groupKind === "base" && right.groupKind !== "base") return -1;
      if (left.groupKind !== "base" && right.groupKind === "base") return 1;
      if (left.groupId !== right.groupId) return left.groupId.localeCompare(right.groupId);
      return left.psnTrophyId - right.psnTrophyId;
    });

    const groups: TrophyGroupView[] = [...groupById.entries()].map(([id, group]) => {
      const groupTrophies = trophies.filter((trophy) => trophy.groupId === group.groupId);
      return {
        id,
        ...group,
        totalCount: groupTrophies.length,
        earnedCount: groupTrophies.filter((trophy) => trophy.earned).length,
      };
    });
    groups.sort((left, right) => {
      if (left.kind === "base" && right.kind !== "base") return -1;
      if (left.kind !== "base" && right.kind === "base") return 1;
      return left.groupId.localeCompare(right.groupId);
    });

    const trophyById = new Map(trophies.map((trophy) => [trophy.id, trophy]));
    const { data: eventData, error: eventError } = await this.client
      .from("progress_events")
      .select("id,event_type,occurred_at,detected_at,trophy_id")
      .eq("psn_account_id", psnAccountId)
      .eq("game_id", gameId)
      .in("event_type", ["trophy_earned", "platinum_earned"])
      .order("detected_at", { ascending: false })
      .limit(20);
    if (eventError) storageFailure();

    const recentEvents: ProgressEventView[] = [];
    for (const row of (Array.isArray(eventData) ? eventData : []) as Record<string, unknown>[]) {
      const id = stringValue(row.id);
      const trophyId = stringValue(row.trophy_id);
      const occurredAt = stringValue(row.occurred_at);
      const detectedAt = stringValue(row.detected_at);
      if (!id || !trophyId || !occurredAt || !detectedAt) storageFailure();
      const trophy = trophyById.get(trophyId);
      if (!trophy) storageFailure();
      recentEvents.push({
        id,
        eventType: progressEventType(row.event_type),
        occurredAt,
        detectedAt,
        trophyId,
        psnTrophyId: trophy.psnTrophyId,
        trophyName: trophy.name,
        trophyType: trophy.type,
        groupId: trophy.groupId,
        groupKind: trophy.groupKind,
      });
    }

    const baseTrophies = trophies.filter((trophy) => trophy.groupKind === "base");
    const additionalTrophies = trophies.filter((trophy) => trophy.groupKind !== "base");
    const latestRun = await this.getLatestSuccessfulGameRun(psnAccountId, gameId);

    return {
      gameId,
      title,
      platforms: stringArray(game.platforms),
      iconUrl: stringValue(game.icon_url),
      libraryProgressPercent: nullableNumber(accountGame.progress_percent),
      lastTrophySyncAt: latestRun?.finishedAt ?? null,
      base: {
        totalCount: baseTrophies.length,
        earnedCount: baseTrophies.filter((trophy) => trophy.earned).length,
        platinumTotal: baseTrophies.filter((trophy) => trophy.type === "platinum").length,
        platinumEarned: baseTrophies.filter(
          (trophy) => trophy.type === "platinum" && trophy.earned,
        ).length,
      },
      additional: {
        totalCount: additionalTrophies.length,
        earnedCount: additionalTrophies.filter((trophy) => trophy.earned).length,
      },
      groups,
      trophies,
      recentEvents,
    };
  }
}
