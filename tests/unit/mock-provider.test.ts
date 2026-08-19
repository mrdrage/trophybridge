import { describe, expect, it } from "vitest";

import { MockPsnProvider } from "../../lib/psn/mock-provider";

const fixture = {
  account: { accountId: "123", onlineId: "mrdrage2" },
  games: [
    {
      communicationId: "NPWR00001_00",
      serviceName: "trophy2" as const,
      title: "Example Game",
      platforms: ["PS5" as const],
      progressPercent: 32,
      iconUrl: null,
      definedTrophies: { bronze: 8, silver: 1, gold: 0, platinum: 1 },
      earnedTrophies: { bronze: 3, silver: 0, gold: 0, platinum: 0 },
      lastUpdatedAt: "2026-08-19T08:00:00Z",
      hidden: false,
    },
  ],
  groups: {
    "trophy2:NPWR00001_00": [
      {
        groupId: "default",
        kind: "base" as const,
        name: "Base Game",
        iconUrl: null,
        definedTrophies: { bronze: 8, silver: 1, gold: 0, platinum: 1 },
      },
    ],
  },
  trophies: {
    "trophy2:NPWR00001_00": [
      {
        trophyId: 1,
        groupId: "default",
        name: "First Step",
        description: "Earn a test trophy.",
        type: "bronze" as const,
        hidden: false,
        iconUrl: null,
      },
    ],
  },
  userTrophies: {
    "trophy2:NPWR00001_00": [
      {
        trophyId: 1,
        type: "bronze" as const,
        hidden: false,
        earned: true,
        earnedAt: "2026-08-19T08:00:00Z",
        rarity: "common" as const,
        earnedRate: 63.4,
        progressValue: null,
        progressTarget: null,
        progressPercent: 100,
      },
    ],
  },
};

describe("MockPsnProvider", () => {
  it("returns deterministic fixture data", async () => {
    const provider = new MockPsnProvider(fixture);
    const [game] = await provider.getGames();

    expect((await provider.getAccount()).onlineId).toBe("mrdrage2");
    expect((await provider.getTrophyGroups(game))[0]?.kind).toBe("base");
    expect((await provider.getTrophies(game))[0]?.name).toBe("First Step");
    expect((await provider.getUserTrophies(game))[0]?.earned).toBe(true);
  });
});
