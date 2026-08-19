import { describe, expect, it } from "vitest";

import { getAppUrl, getPsnTrophyLocale } from "../../lib/config/server";

describe("server configuration", () => {
  it("defaults the trophy metadata locale to Italian", () => {
    expect(getPsnTrophyLocale({} as NodeJS.ProcessEnv)).toBe("it-IT");
  });

  it("allows localhost as the application URL only for development/test", () => {
    expect(getAppUrl({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(
      "http://localhost:3000",
    );
    expect(getAppUrl({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(
      "http://localhost:3000",
    );
  });

  it("requires an explicit application URL in production", () => {
    expect(() => getAppUrl({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      "APP_URL is required",
    );
  });

  it("normalizes an explicit application URL to its origin", () => {
    expect(
      getAppUrl({
        NODE_ENV: "production",
        APP_URL: "https://trophybridge.example/dashboard",
      } as NodeJS.ProcessEnv),
    ).toBe("https://trophybridge.example");
  });
});
