import { describe, expect, it, vi } from "vitest";

import { PsnConnectionError } from "../../lib/psn/connection-errors";
import {
  ShareService,
  type AiContextPolicy,
  type PublicGameRefresher,
  type SharingAccountReader,
} from "../../lib/sharing/service";
import type { ResolvedShareLink, SharingRepository } from "../../lib/sharing/types";
import type { GameTrophyDetail, TrophyRepository, TrophyView } from "../../lib/trophies/types";

const token = "tb1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const gameId = "30000000-0000-0000-0000-000000000801";

const share: ResolvedShareLink = {
  linkId: "20000000-0000-0000-0000-000000000801",
  psnAccountId: "10000000-0000-0000-0000-000000000801",
  ownerUserId: "00000000-0000-0000-0000-000000000801",
  onlineId: "fixture-m8-player",
  preferredLocale: "it-IT",
  lastSuccessfulSyncAt: "2026-08-20T11:00:00Z",
  createdAt: "2026-08-20T10:00:00Z",
  lastUsedAt: null,
  active: true,
  revokedAt: null,
};

const policy: AiContextPolicy = {
  freshnessSeconds: 600,
  maxRefreshesPerHour: 12,
  maxMissingTrophies: 200,
};

function trophy(overrides: Partial<TrophyView>): TrophyView {
  return {
    id: "trophy-1",
    psnTrophyId: 1,
    groupId: "default",
    groupKind: "base",
    name: "Primo passo",
    description: "Ottieni il primo trofeo.",
    type: "bronze",
    hidden: false,
    iconUrl: "https://example.invalid/trophy.png",
    rarity: "common",
    earnedRate: 70,
    earned: true,
    earnedAt: "2026-08-20T09:00:00Z",
    progressValue: null,
    progressTarget: null,
    progressPercent: null,
    ...overrides,
  };
}

function detail(secondEarned = false): GameTrophyDetail {
  return {
    gameId,
    title: "Fixture M8",
    platforms: ["PS5"],
    iconUrl: "https://example.invalid/game.png",
    libraryProgressPercent: secondEarned ? 66 : 33,
    lastTrophySyncAt: secondEarned ? "2026-08-20T12:00:00Z" : "2026-08-20T11:00:00Z",
    base: {
      totalCount: 3,
      earnedCount: secondEarned ? 2 : 1,
      platinumTotal: 1,
      platinumEarned: 0,
    },
    additional: { totalCount: 0, earnedCount: 0 },
    groups: [
      {
        id: "group-1",
        groupId: "default",
        kind: "base",
        name: "Fixture M8",
        iconUrl: null,
        totalCount: 3,
        earnedCount: secondEarned ? 2 : 1,
      },
    ],
    trophies: [
      trophy({}),
      trophy({
        id: "trophy-2",
        psnTrophyId: 2,
        name: "Secondo passo",
        earned: secondEarned,
        earnedAt: secondEarned ? "2026-08-20T11:59:00Z" : null,
      }),
      trophy({
        id: "trophy-3",
        psnTrophyId: 3,
        name: "Segreto finale",
        description: "Spoiler.",
        type: "platinum",
        hidden: true,
        earned: false,
        earnedAt: null,
      }),
    ],
    recentEvents: secondEarned
      ? [
          {
            id: "event-1",
            eventType: "trophy_earned",
            occurredAt: "2026-08-20T11:59:00Z",
            detectedAt: "2026-08-20T12:00:00Z",
            trophyId: "trophy-2",
            psnTrophyId: 2,
            trophyName: "Secondo passo",
            trophyType: "bronze",
            groupId: "default",
            groupKind: "base",
          },
        ]
      : [],
  };
}

function makeService(input?: {
  claimAllowed?: boolean;
  retryAfterSeconds?: number | null;
  refresh?: PublicGameRefresher["sync"];
}) {
  let currentDetail = detail(false);
  const accounts: SharingAccountReader = {
    getAccountForOwner: vi.fn(async () => null),
  };
  const sharing: SharingRepository = {
    getActiveLink: vi.fn(async () => ({ active: false, createdAt: null, lastUsedAt: null })),
    rotateActiveLink: vi.fn(async () => ({ active: true, createdAt: "2026-08-20T12:00:00Z", lastUsedAt: null })),
    revokeActiveLink: vi.fn(async () => ({ active: false, createdAt: null, lastUsedAt: null })),
    resolveByTokenHash: vi.fn(async () => share),
    touchLink: vi.fn(async () => undefined),
    claimAiRefresh: vi.fn(async () => ({
      allowed: input?.claimAllowed ?? true,
      retryAfterSeconds: input?.retryAfterSeconds ?? null,
    })),
    listVisibleGames: vi.fn(async () => ({ totalCount: 1, games: [] })),
    isGameVisible: vi.fn(async () => true),
  };
  const trophies = {
    getGameDetail: vi.fn(async () => currentDetail),
  } as unknown as TrophyRepository;
  const refresh = vi.fn(
    input?.refresh ??
      (async () => {
        currentDetail = detail(true);
        return {
          gameId,
          processedCount: 3,
          earnedCount: 2,
          baseTrophyCount: 3,
          baseEarnedCount: 2,
          additionalTrophyCount: 0,
          additionalEarnedCount: 0,
          newTrophiesFound: 1,
          syncedAt: "2026-08-20T12:00:00Z",
          nextAllowedAt: "2026-08-20T12:05:00Z",
        };
      }),
  );
  const refresher: PublicGameRefresher = { sync: refresh };

  return {
    service: new ShareService(
      accounts,
      sharing,
      trophies,
      refresher,
      policy,
      () => new Date("2026-08-20T12:00:00Z"),
    ),
    sharing,
    refresh,
  };
}

describe("M8 AI context", () => {
  it("returns compact platinum context without contacting PSN unless freshness is requested", async () => {
    const { service, refresh } = makeService();
    const context = await service.getAiContext(token, gameId, false);

    expect(refresh).not.toHaveBeenCalled();
    expect(context.progress.base).toMatchObject({
      earned_count: 1,
      total_count: 3,
      missing_count: 2,
      platinum_earned: false,
    });
    expect(context.missing_trophies.count).toBe(2);
    expect(context.missing_trophies.items[1]).toMatchObject({
      psn_trophy_id: 3,
      spoiler_masked: true,
      name: null,
      description: null,
    });
    expect(context.sync.refresh_outcome).toBe("not_requested");
  });

  it("refreshes one stale game on fresh=1 and returns the newly persisted state", async () => {
    const { service, sharing, refresh } = makeService();
    const context = await service.getAiContext(token, gameId, true);

    expect(sharing.claimAiRefresh).toHaveBeenCalledWith(
      share.linkId,
      "2026-08-20T12:00:00.000Z",
      3600,
      12,
    );
    expect(refresh).toHaveBeenCalledWith(share.ownerUserId, gameId);
    expect(context.progress.base.earned_count).toBe(2);
    expect(context.missing_trophies.count).toBe(1);
    expect(context.recent_activity[0]?.trophy.name).toBe("Secondo passo");
    expect(context.sync).toMatchObject({
      is_fresh: true,
      refresh_requested: true,
      refresh_attempted: true,
      refresh_outcome: "success",
      new_trophies_found: 1,
      served_last_good: false,
    });
  });

  it("serves last-good trophy state when PSN reauthentication blocks a requested refresh", async () => {
    const { service } = makeService({
      refresh: async () => {
        throw new PsnConnectionError("REAUTH_REQUIRED");
      },
    });

    const context = await service.getAiContext(token, gameId, true);
    expect(context.progress.base.earned_count).toBe(1);
    expect(context.sync).toMatchObject({
      refresh_attempted: true,
      refresh_outcome: "reauth_required",
      served_last_good: true,
      is_fresh: false,
    });
  });

  it("refuses excess AI refresh work while still serving cached state", async () => {
    const { service, refresh } = makeService({
      claimAllowed: false,
      retryAfterSeconds: 900,
    });

    const context = await service.getAiContext(token, gameId, true);
    expect(refresh).not.toHaveBeenCalled();
    expect(context.progress.base.earned_count).toBe(1);
    expect(context.sync).toMatchObject({
      refresh_attempted: false,
      refresh_outcome: "rate_limited",
      retry_after_seconds: 900,
    });
  });
});
