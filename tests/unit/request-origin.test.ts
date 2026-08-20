import { describe, expect, it } from "vitest";

import {
  getRequestOrigin,
  isTrustedMutationRequest,
} from "../../lib/http/request-origin";

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

describe("isTrustedMutationRequest", () => {
  it("accepts a same-origin Vercel POST", () => {
    const headers = new Headers({
      origin: "https://trophybridge.vercel.app",
      "x-forwarded-host": "trophybridge.vercel.app",
      "x-forwarded-proto": "https",
    });

    expect(isTrustedMutationRequest("POST", headers)).toBe(true);
  });

  it("accepts a same-origin localhost POST", () => {
    const headers = new Headers({
      origin: "http://localhost:3001",
      host: "localhost:3001",
    });

    expect(isTrustedMutationRequest("POST", headers)).toBe(true);
  });

  it("rejects a cross-origin mutation", () => {
    const headers = new Headers({
      origin: "https://attacker.example",
      "x-forwarded-host": "trophybridge.vercel.app",
      "x-forwarded-proto": "https",
    });

    expect(isTrustedMutationRequest("DELETE", headers)).toBe(false);
  });

  it("rejects mutation requests with no browser Origin header", () => {
    const headers = new Headers({
      "x-forwarded-host": "trophybridge.vercel.app",
      "x-forwarded-proto": "https",
    });

    expect(isTrustedMutationRequest("POST", headers)).toBe(false);
  });

  it("does not require Origin for safe methods", () => {
    expect(isTrustedMutationRequest("GET", new Headers())).toBe(true);
    expect(isTrustedMutationRequest("HEAD", new Headers())).toBe(true);
  });
});
