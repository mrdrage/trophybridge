import { describe, expect, it } from "vitest";

import { PsnProviderError } from "../../lib/psn/errors";
import {
  classifyTrophyGroup,
  mapGame,
  mapPlatforms,
  mapTrophyRarity,
  mapUserTrophy,
} from "../../lib/psn/mapper";

describe("PSN mapper", () => {
  it("normalizes shared platform strings", () => {
    expect(mapPlatforms("PS4,PSVITA")).toEqual(["PS4", "PSVITA"]);
    expect(mapPlatforms("future-console")).toEqual(["UNKNOWN"]);
  });

  it("classifies base, DLC and unexpected trophy groups without guessing", () => {
    expect(classifyTrophyGroup("default")).toBe("base");
    expect(classifyTrophyGroup("001")).toBe("dlc");
    expect(classifyTrophyGroup("bonus")).toBe("unknown");
  });

  it("maps a trophy title into a database-compatible domain game", () => {
    const game = mapGame({
      npServiceName: "trophy2",
      npCommunicationId: "NPWR90001_00",
      trophyTitleName: "Fixture Adventure",
      trophyTitlePlatform: "PS5",
      trophyTitleIconUrl: "https://example.invalid/game.png",
      progress: 32,
      definedTrophies: { bronze: 40, silver: 7, gold: 2, platinum: 1 },
      earnedTrophies: { bronze: 14, silver: 1, gold: 0, platinum: 0 },
      hiddenFlag: false,
      lastUpdatedDateTime: "2026-08-18T21:45:00Z",
    });

    expect(game.serviceName).toBe("trophy2");
    expect(game.platforms).toEqual(["PS5"]);
    expect(game.definedTrophies.platinum).toBe(1);
    expect(game.earnedTrophies.bronze).toBe(14);
  });

  it("maps rarity and honest progress semantics from psn-api", () => {
    expect(mapTrophyRarity(0)).toBe("ultra_rare");
    expect(mapTrophyRarity(3)).toBe("common");
    expect(mapTrophyRarity(99)).toBe("unknown");

    const missing = mapUserTrophy({
      trophyId: 2,
      trophyHidden: true,
      trophyType: "silver",
      earned: false,
      trophyRare: 1,
      trophyEarnedRate: "8.2",
      trophyProgressTargetValue: "20",
    });

    expect(missing.progressTarget).toBe(20);
    expect(missing.progressValue).toBeNull();
    expect(missing.progressPercent).toBeNull();
    expect(missing.rarity).toBe("very_rare");

    const earned = mapUserTrophy({
      trophyId: 1,
      trophyHidden: false,
      trophyType: "bronze",
      earned: true,
      earnedDateTime: "2026-08-18T21:00:00Z",
      trophyRare: 3,
      trophyEarnedRate: "63.4",
    });

    expect(earned.progressPercent).toBe(100);
    expect(earned.earnedAt).toBe("2026-08-18T21:00:00Z");
  });

  it("rejects malformed upstream payloads at the boundary", () => {
    expect(() => mapGame({ trophyTitleName: "Incomplete" })).toThrowError(
      PsnProviderError,
    );
  });
});
