import { describe, expect, it } from "vitest";

import { getRequestOrigin } from "../../lib/http/request-origin";

describe("getRequestOrigin", () => {
  it("uses Vercel forwarded headers for the public origin", () => {
    const headers = new Headers({
      "x-forwarded-host": "trophybridge.vercel.app",
      "x-forwarded-proto": "https",
      host: "internal.example",
    });

    expect(getRequestOrigin(headers)).toBe("https://trophybridge.vercel.app");
  });

  it("uses http for localhost when no forwarded protocol is present", () => {
    const headers = new Headers({ host: "localhost:3001" });
    expect(getRequestOrigin(headers)).toBe("http://localhost:3001");
  });

  it("uses the supplied fallback when request host headers are unavailable", () => {
    expect(getRequestOrigin(new Headers(), "https://trophybridge.vercel.app/path")).toBe(
      "https://trophybridge.vercel.app",
    );
  });

  it("rejects unexpected forwarded protocols", () => {
    const headers = new Headers({
      "x-forwarded-host": "trophybridge.vercel.app",
      "x-forwarded-proto": "javascript",
    });

    expect(() => getRequestOrigin(headers)).toThrow("Request protocol is invalid");
  });
});
