import { z } from "zod";

import { invalidPsnResponse } from "./errors";
import type {
  PsnGame,
  PsnPlatform,
  PsnTrophy,
  PsnTrophyCounts,
  PsnTrophyGroup,
  PsnTrophyGroupKind,
  PsnTrophyRarity,
  PsnUserTrophy,
} from "./provider";

const trophyCountsSchema = z.object({
  bronze: z.number().int().nonnegative(),
  silver: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  platinum: z.number().int().nonnegative(),
});

const trophyTitleSchema = z
  .object({
    npServiceName: z.enum(["trophy", "trophy2"]),
    npCommunicationId: z.string().min(1),
    trophyTitleName: z.string().min(1),
    trophyTitlePlatform: z.string(),
    trophyTitleIconUrl: z.string().nullable().optional(),
    progress: z.number().min(0).max(100),
    definedTrophies: trophyCountsSchema,
    earnedTrophies: trophyCountsSchema,
    hiddenFlag: z.boolean().optional().default(false),
    lastUpdatedDateTime: z.string().nullable().optional(),
  })
  .passthrough();

const trophyGroupSchema = z
  .object({
    trophyGroupId: z.string().min(1),
    trophyGroupName: z.string().nullable().optional(),
    trophyGroupIconUrl: z.string().nullable().optional(),
    definedTrophies: trophyCountsSchema,
  })
  .passthrough();

const titleTrophySchema = z
  .object({
    trophyId: z.number().int().nonnegative(),
    trophyHidden: z.boolean(),
    trophyType: z.enum(["bronze", "silver", "gold", "platinum"]),
    trophyName: z.string().nullable().optional(),
    trophyDetail: z.string().nullable().optional(),
    trophyIconUrl: z.string().nullable().optional(),
    trophyGroupId: z.string().nullable().optional(),
  })
  .passthrough();

const userTrophySchema = z
  .object({
    trophyId: z.number().int().nonnegative(),
    trophyHidden: z.boolean(),
    trophyType: z.enum(["bronze", "silver", "gold", "platinum"]),
    earned: z.boolean().optional().default(false),
    earnedDateTime: z.string().nullable().optional(),
    trophyRare: z.number().int().nullable().optional(),
    trophyEarnedRate: z.string().nullable().optional(),
    trophyProgressTargetValue: z.string().nullable().optional(),
  })
  .passthrough();

function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown, label: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw invalidPsnResponse(`Invalid ${label} payload from psn-api`, result.error);
  }
  return result.data;
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberFromString(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapTrophyCounts(payload: unknown): PsnTrophyCounts {
  return parseOrThrow(trophyCountsSchema, payload, "trophy counts");
}

export function mapPlatforms(value: string): PsnPlatform[] {
  const normalized = value
    .split(",")
    .map((item) => item.trim().toUpperCase().replace(/[\s_-]/g, ""))
    .filter(Boolean)
    .map<PsnPlatform>((item) => {
      if (item === "PS5") return "PS5";
      if (item === "PS4") return "PS4";
      if (item === "PS3") return "PS3";
      if (item === "PSVITA" || item === "VITA") return "PSVITA";
      return "UNKNOWN";
    });

  return normalized.length > 0 ? [...new Set(normalized)] : ["UNKNOWN"];
}

export function mapGame(payload: unknown): PsnGame {
  const title = parseOrThrow(trophyTitleSchema, payload, "trophy title");

  return {
    communicationId: title.npCommunicationId,
    serviceName: title.npServiceName,
    title: title.trophyTitleName,
    platforms: mapPlatforms(title.trophyTitlePlatform),
    progressPercent: title.progress,
    iconUrl: nullIfBlank(title.trophyTitleIconUrl),
    definedTrophies: title.definedTrophies,
    earnedTrophies: title.earnedTrophies,
    lastUpdatedAt: nullIfBlank(title.lastUpdatedDateTime),
    hidden: title.hiddenFlag,
  };
}

export function classifyTrophyGroup(groupId: string): PsnTrophyGroupKind {
  if (groupId === "default") return "base";
  if (/^\d{3}$/.test(groupId)) return "dlc";
  return "unknown";
}

export function mapTrophyGroup(payload: unknown): PsnTrophyGroup {
  const group = parseOrThrow(trophyGroupSchema, payload, "trophy group");

  return {
    groupId: group.trophyGroupId,
    kind: classifyTrophyGroup(group.trophyGroupId),
    name: nullIfBlank(group.trophyGroupName),
    iconUrl: nullIfBlank(group.trophyGroupIconUrl),
    definedTrophies: group.definedTrophies,
  };
}

export function mapTrophy(payload: unknown): PsnTrophy {
  const trophy = parseOrThrow(titleTrophySchema, payload, "title trophy");

  return {
    trophyId: trophy.trophyId,
    groupId: nullIfBlank(trophy.trophyGroupId) ?? "unknown",
    name: nullIfBlank(trophy.trophyName),
    description: nullIfBlank(trophy.trophyDetail),
    type: trophy.trophyType,
    hidden: trophy.trophyHidden,
    iconUrl: nullIfBlank(trophy.trophyIconUrl),
  };
}

export function mapTrophyRarity(value: number | null | undefined): PsnTrophyRarity {
  switch (value) {
    case 0:
      return "ultra_rare";
    case 1:
      return "very_rare";
    case 2:
      return "rare";
    case 3:
      return "common";
    default:
      return "unknown";
  }
}

export function mapUserTrophy(payload: unknown): PsnUserTrophy {
  const trophy = parseOrThrow(userTrophySchema, payload, "user trophy");
  const earned = trophy.earned;
  const progressTarget = numberFromString(trophy.trophyProgressTargetValue);

  return {
    trophyId: trophy.trophyId,
    type: trophy.trophyType,
    hidden: trophy.trophyHidden,
    earned,
    earnedAt: earned ? nullIfBlank(trophy.earnedDateTime) : null,
    rarity: mapTrophyRarity(trophy.trophyRare),
    earnedRate: numberFromString(trophy.trophyEarnedRate),
    progressValue: null,
    progressTarget,
    progressPercent: earned ? 100 : null,
  };
}
