import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  TitleTrophiesResponse,
  TitleTrophyGroupsResponse,
  UserTitlesResponse,
  UserTrophiesEarnedForTitleResponse,
} from "psn-api";
import { describe, expect, it, vi } from "vitest";

import { PsnApiProvider, type PsnApiCalls } from "../../lib/psn/psn-api-provider";

function fixture<T>(name: string): T {
  const path = join(process.cwd(), "tests", "fixtures", "psn", name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const userTitlesPage1 = fixture<UserTitlesResponse>("user-titles-page-1.json");
const userTitlesPage2 = fixture<UserTitlesResponse>("user-titles-page-2.json");
const trophyGroups = fixture<TitleTrophyGroupsResponse>("trophy-groups.json");
const titleTrophiesPage1 = fixture<TitleTrophiesResponse>("title-trophies-page-1.json");
const titleTrophiesPage2 = fixture<TitleTrophiesResponse>("title-trophies-page-2.json");
const userTrophiesPage1 = fixture<UserTrophiesEarnedForTitleResponse>(
  "user-trophies-page-1.json",
);
const userTrophiesPage2 = fixture<UserTrophiesEarnedForTitleResponse>(
  "user-trophies-page-2.json",
);

function makeCalls() {
  const getUserTitlesMock = vi.fn(
    async (...args: Parameters<PsnApiCalls["getUserTitles"]>) =>
      args[2]?.offset === 1 ? userTitlesPage2 : userTitlesPage1,
  );
  const getTitleTrophyGroupsMock = vi.fn(
    async (..._args: Parameters<PsnApiCalls["getTitleTrophyGroups"]>) => trophyGroups,
  );
  const getTitleTrophiesMock = vi.fn(
    async (...args: Parameters<PsnApiCalls["getTitleTrophies"]>) =>
      args[3]?.offset === 2 ? titleTrophiesPage2 : titleTrophiesPage1,
  );
  const getUserTrophiesEarnedForTitleMock = vi.fn(
    async (...args: Parameters<PsnApiCalls["getUserTrophiesEarnedForTitle"]>) =>
      args[4]?.offset === 2 ? userTrophiesPage2 : userTrophiesPage1,
  );

  const calls: PsnApiCalls = {
    getUserTitles: getUserTitlesMock,
    getTitleTrophyGroups: getTitleTrophyGroupsMock,
    getTitleTrophies: getTitleTrophiesMock,
    getUserTrophiesEarnedForTitle: getUserTrophiesEarnedForTitleMock,
  };

  return {
    calls,
    getUserTitlesMock,
    getTitleTrophyGroupsMock,
    getTitleTrophiesMock,
    getUserTrophiesEarnedForTitleMock,
  };
}

describe("PsnApiProvider", () => {
  it("paginates games and preserves PS5 versus legacy service identity", async () => {
    const { calls, getUserTitlesMock } = makeCalls();
    const provider = new PsnApiProvider({
      authorization: { accessToken: "fixture-access-token" },
      account: { accountId: "123456789", onlineId: "fixture-player" },
      locale: "it-IT",
      calls,
    });

    const games = await provider.getGames();

    expect(games).toHaveLength(2);
    expect(games[0]?.serviceName).toBe("trophy2");
    expect(games[0]?.platforms).toEqual(["PS5"]);
    expect(games[1]?.serviceName).toBe("trophy");
    expect(games[1]?.platforms).toEqual(["PS4", "PSVITA"]);
    expect(getUserTitlesMock).toHaveBeenCalledTimes(2);
    expect(getUserTitlesMock.mock.calls[0]?.[2]).toMatchObject({
      offset: 0,
      headerOverrides: { "Accept-Language": "it-IT" },
    });
    expect(getUserTitlesMock.mock.calls[1]?.[2]).toMatchObject({ offset: 1 });
  });

  it("maps base and DLC groups structurally", async () => {
    const { calls, getTitleTrophyGroupsMock } = makeCalls();
    const provider = new PsnApiProvider({
      authorization: { accessToken: "fixture-access-token" },
      account: { accountId: "123456789", onlineId: "fixture-player" },
      calls,
    });

    const groups = await provider.getTrophyGroups({
      communicationId: "NPWR90001_00",
      serviceName: "trophy2",
    });

    expect(groups.map((group) => group.kind)).toEqual(["base", "dlc"]);
    expect(getTitleTrophyGroupsMock.mock.calls[0]?.[2]).toMatchObject({
      npServiceName: "trophy2",
    });
  });

  it("paginates title and user trophies and maps progress conservatively", async () => {
    const { calls, getTitleTrophiesMock, getUserTrophiesEarnedForTitleMock } = makeCalls();
    const provider = new PsnApiProvider({
      authorization: { accessToken: "fixture-access-token" },
      account: { accountId: "123456789", onlineId: "fixture-player" },
      calls,
    });
    const game = {
      communicationId: "NPWR90001_00",
      serviceName: "trophy2" as const,
    };

    const [trophies, userTrophies] = await Promise.all([
      provider.getTrophies(game),
      provider.getUserTrophies(game),
    ]);

    expect(trophies).toHaveLength(3);
    expect(trophies[2]?.groupId).toBe("001");
    expect(userTrophies).toHaveLength(3);
    expect(userTrophies[0]).toMatchObject({
      earned: true,
      progressPercent: 100,
      rarity: "common",
    });
    expect(userTrophies[1]).toMatchObject({
      earned: false,
      progressValue: null,
      progressTarget: 20,
      progressPercent: null,
      rarity: "very_rare",
    });
    expect(getTitleTrophiesMock).toHaveBeenCalledTimes(2);
    expect(getUserTrophiesEarnedForTitleMock).toHaveBeenCalledTimes(2);
  });

  it("returns the configured stable account identity without another network call", async () => {
    const { calls } = makeCalls();
    const provider = new PsnApiProvider({
      authorization: { accessToken: "fixture-access-token" },
      account: { accountId: "123456789", onlineId: "fixture-player" },
      calls,
    });

    await expect(provider.getAccount()).resolves.toEqual({
      accountId: "123456789",
      onlineId: "fixture-player",
    });
  });
});
