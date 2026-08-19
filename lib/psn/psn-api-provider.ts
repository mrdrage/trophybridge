import {
  getTitleTrophies,
  getTitleTrophyGroups,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type AuthorizationPayload,
  type TitleTrophiesResponse,
  type TitleTrophyGroupsResponse,
  type UserTitlesResponse,
  type UserTrophiesEarnedForTitleResponse,
} from "psn-api";

import {
  invalidPsnResponse,
  normalizePsnError,
  throwIfPsnError,
} from "./errors";
import {
  mapGame,
  mapTrophy,
  mapTrophyGroup,
  mapUserTrophy,
} from "./mapper";
import type {
  PsnAccount,
  PsnGame,
  PsnGameRef,
  PsnProvider,
  PsnTrophy,
  PsnTrophyGroup,
  PsnUserTrophy,
} from "./provider";

export interface PsnApiCalls {
  getUserTitles: typeof getUserTitles;
  getTitleTrophyGroups: typeof getTitleTrophyGroups;
  getTitleTrophies: typeof getTitleTrophies;
  getUserTrophiesEarnedForTitle: typeof getUserTrophiesEarnedForTitle;
}

export interface PsnApiProviderOptions {
  authorization: AuthorizationPayload;
  account: PsnAccount;
  locale?: string;
  titlePageSize?: number;
  trophyPageSize?: number;
  calls?: Partial<PsnApiCalls>;
}

const defaultCalls: PsnApiCalls = {
  getUserTitles,
  getTitleTrophyGroups,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
};

function clampPageSize(value: number | undefined, fallback: number, max: number): number {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function nextOffsetFrom(response: unknown): number | undefined {
  if (!response || typeof response !== "object") return undefined;
  const value = (response as { nextOffset?: unknown }).nextOffset;
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidPsnResponse("psn-api returned an invalid nextOffset");
  }
  return value;
}

function ensureArrayProperty(
  response: unknown,
  property: "trophyTitles" | "trophyGroups" | "trophies",
): unknown[] {
  if (!response || typeof response !== "object") {
    throw invalidPsnResponse(`psn-api returned no ${property} response object`);
  }

  const value = (response as Record<string, unknown>)[property];
  if (!Array.isArray(value)) {
    throw invalidPsnResponse(`psn-api response is missing ${property}`);
  }

  return value;
}

export class PsnApiProvider implements PsnProvider {
  private readonly calls: PsnApiCalls;
  private readonly locale: string;
  private readonly titlePageSize: number;
  private readonly trophyPageSize: number;

  constructor(private readonly options: PsnApiProviderOptions) {
    this.calls = { ...defaultCalls, ...options.calls };
    this.locale = options.locale ?? "en-US";
    this.titlePageSize = clampPageSize(options.titlePageSize, 200, 800);
    this.trophyPageSize = clampPageSize(options.trophyPageSize, 100, 800);
  }

  async getAccount(): Promise<PsnAccount> {
    return this.options.account;
  }

  async getGames(): Promise<PsnGame[]> {
    const games: PsnGame[] = [];
    const seenOffsets = new Set<number>();
    let offset = 0;

    while (true) {
      if (seenOffsets.has(offset)) {
        throw invalidPsnResponse("psn-api title pagination repeated an offset");
      }
      seenOffsets.add(offset);

      const response = await this.execute<UserTitlesResponse>(() =>
        this.calls.getUserTitles(this.authorization, this.options.account.accountId, {
          limit: this.titlePageSize,
          offset,
          headerOverrides: this.headers,
        }),
      );

      games.push(...ensureArrayProperty(response, "trophyTitles").map(mapGame));

      const nextOffset = nextOffsetFrom(response);
      if (nextOffset == null) break;
      offset = nextOffset;
    }

    return games;
  }

  async getTrophyGroups(game: PsnGameRef): Promise<PsnTrophyGroup[]> {
    const response = await this.execute<TitleTrophyGroupsResponse>(() =>
      this.calls.getTitleTrophyGroups(this.authorization, game.communicationId, {
        npServiceName: game.serviceName,
        headerOverrides: this.headers,
      }),
    );

    return ensureArrayProperty(response, "trophyGroups").map(mapTrophyGroup);
  }

  async getTrophies(game: PsnGameRef): Promise<PsnTrophy[]> {
    return this.getPagedTrophies<TitleTrophiesResponse, PsnTrophy>(
      (offset) =>
        this.calls.getTitleTrophies(this.authorization, game.communicationId, "all", {
          npServiceName: game.serviceName,
          limit: this.trophyPageSize,
          offset,
          headerOverrides: this.headers,
        }),
      mapTrophy,
      "title trophy",
    );
  }

  async getUserTrophies(game: PsnGameRef): Promise<PsnUserTrophy[]> {
    return this.getPagedTrophies<UserTrophiesEarnedForTitleResponse, PsnUserTrophy>(
      (offset) =>
        this.calls.getUserTrophiesEarnedForTitle(
          this.authorization,
          this.options.account.accountId,
          game.communicationId,
          "all",
          {
            npServiceName: game.serviceName,
            limit: this.trophyPageSize,
            offset,
            headerOverrides: this.headers,
          },
        ),
      mapUserTrophy,
      "user trophy",
    );
  }

  private get authorization(): AuthorizationPayload {
    return this.options.authorization;
  }

  private get headers() {
    return { "Accept-Language": this.locale } as const;
  }

  private async getPagedTrophies<TResponse, TResult>(
    request: (offset: number) => Promise<TResponse>,
    mapper: (payload: unknown) => TResult,
    label: string,
  ): Promise<TResult[]> {
    const items: TResult[] = [];
    const seenOffsets = new Set<number>();
    let offset = 0;

    while (true) {
      if (seenOffsets.has(offset)) {
        throw invalidPsnResponse(`psn-api ${label} pagination repeated an offset`);
      }
      seenOffsets.add(offset);

      const response = await this.execute<TResponse>(() => request(offset));
      items.push(...ensureArrayProperty(response, "trophies").map(mapper));

      const nextOffset = nextOffsetFrom(response);
      if (nextOffset == null) break;
      offset = nextOffset;
    }

    return items;
  }

  private async execute<T>(request: () => Promise<T>): Promise<T> {
    try {
      const response = await request();
      throwIfPsnError(response);
      return response;
    } catch (error) {
      throw normalizePsnError(error);
    }
  }
}
