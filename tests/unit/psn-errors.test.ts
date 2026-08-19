import { describe, expect, it } from "vitest";

import {
  PsnProviderError,
  normalizePsnError,
  throwIfPsnError,
} from "../../lib/psn/errors";

describe("PSN provider errors", () => {
  it("normalizes access-control and rate-limit failures", () => {
    expect(normalizePsnError(new Error("Not permitted by access control")).code).toBe(
      "FORBIDDEN",
    );
    expect(normalizePsnError(new Error("Too Many Requests")).code).toBe("RATE_LIMITED");
    expect(normalizePsnError(new Error("Too Many Requests")).retryable).toBe(true);
  });

  it("turns psn-api error payloads into stable provider errors", () => {
    expect(() =>
      throwIfPsnError({
        error: {
          code: 2240513,
          message: "Resource Not Found",
        },
      }),
    ).toThrowError(PsnProviderError);

    try {
      throwIfPsnError({ error: { code: 2240513, message: "Resource Not Found" } });
    } catch (error) {
      expect(error).toMatchObject({ code: "NOT_FOUND", upstreamCode: 2240513 });
    }
  });
});
