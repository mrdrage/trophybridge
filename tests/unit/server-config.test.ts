import { describe, expect, it } from "vitest";

import { getAiContextPolicy, getAppUrl, getPsnTrophyLocale } from "../../lib/config/server";

describe("server configuration", () => {
  it("defaults the trophy metadata locale to Italian", () => {
    expect(getPsnTrophyLocale({} as NodeJS.ProcessEnv)).toBe("it-IT");
  });

  it("defaults M8 AI freshness to ten minutes with a bounded hourly refresh budget", () => {
    expect(getAiContextPolicy({} as NodeJS.ProcessEnv)).toEqual({
      freshnessSeconds: 600,
      maxRefreshesPerHour: 12,
      maxMissingTrophies: 200,
    });
  });

  it("rejects an unbounded M8 public refresh budget", () => {
    expect(() =>
      getAiContextPolicy(
        { AI_CONTEXT_MAX_REFRESHES_PER_HOUR: "1000" } as unknown as NodeJS.ProcessEnv,
      ),
    ).toThrow("AI_CONTEXT_MAX_REFRESHES_PER_HOUR");
  });

  it("allows localhost as the application URL only for development/test", () => {
    expect(getAppUrl({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(
      "http://localhost:3000",
    );
    expect(getAppUrl({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(
      "http://localhost:3000",
    );
  });

  it("uses the Vercel production project origin when APP_URL is not configured", () => {
    expect(
      getAppUrl({
        NODE_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "trophybridge.vercel.app",
      } as NodeJS.ProcessEnv),
    ).toBe("https://trophybridge.vercel.app");
  });

  it("still requires a canonical production origin away from Vercel", () => {
    expect(() => getAppUrl({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      "APP_URL is required",
    );
  });

  it("prefers and normalizes an explicit application URL", () => {
    expect(
      getAppUrl({
        NODE_ENV: "production",
        APP_URL: "https://trophybridge.example/dashboard",
        VERCEL_PROJECT_PRODUCTION_URL: "ignored.vercel.app",
      } as NodeJS.ProcessEnv),
    ).toBe("https://trophybridge.example");
  });
});
