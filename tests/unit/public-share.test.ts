import { describe, expect, it } from "vitest";

import type { TrophyView } from "../../lib/trophies/types";
import {
  createShareToken,
  hashShareToken,
  isValidShareToken,
} from "../../lib/sharing/service";
import { toPublicTrophy } from "../../lib/sharing/types";

const hiddenMissing: TrophyView = {
  id: "trophy-1",
  psnTrophyId: 7,
  groupId: "default",
  groupKind: "base",
  name: "Segreto della storia",
  description: "Spoiler importante",
  type: "bronze",
  hidden: true,
  iconUrl: "https://example.invalid/secret.png",
  rarity: "rare",
  earnedRate: 12.3,
  earned: false,
  earnedAt: null,
  progressValue: null,
  progressTarget: null,
  progressPercent: null,
};

describe("M7 public sharing", () => {
  it("generates high-entropy versioned capability tokens", () => {
    const first = createShareToken();
    const second = createShareToken();

    expect(isValidShareToken(first)).toBe(true);
    expect(isValidShareToken(second)).toBe(true);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^tb1_[A-Za-z0-9_-]{43}$/);
  });

  it("stores only a deterministic SHA-256 token hash", () => {
    const token = "tb1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(isValidShareToken(token)).toBe(true);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
    expect(hashShareToken(token)).not.toContain(token);
  });

  it("masks spoiler-bearing metadata for unearned hidden trophies", () => {
    expect(toPublicTrophy(hiddenMissing)).toMatchObject({
      psn_trophy_id: 7,
      hidden: true,
      earned: false,
      spoiler_masked: true,
      name: null,
      description: null,
      icon_url: null,
      earned_rate: 12.3,
    });
  });

  it("reveals a hidden trophy after it has actually been earned", () => {
    const earned = toPublicTrophy({
      ...hiddenMissing,
      earned: true,
      earnedAt: "2026-08-20T10:00:00Z",
    });
    expect(earned.spoiler_masked).toBe(false);
    expect(earned.name).toBe("Segreto della storia");
    expect(earned.description).toBe("Spoiler importante");
    expect(earned.icon_url).toBe("https://example.invalid/secret.png");
  });
});
