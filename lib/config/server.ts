function requireValue(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function boundedInteger(
  name: string,
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (rawValue == null || rawValue.trim() === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

export function getSupabasePublicConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    url: requireValue("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: requireValue(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

export function getSupabaseAdminConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    ...getSupabasePublicConfig(env),
    serviceRoleKey: requireValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}

function vercelProductionOrigin(env: NodeJS.ProcessEnv): string | undefined {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : undefined;
}

export function getAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const developmentFallback =
    env.NODE_ENV === "development" || env.NODE_ENV === "test"
      ? "http://localhost:3000"
      : undefined;
  const value = requireValue(
    "APP_URL",
    env.APP_URL ?? vercelProductionOrigin(env) ?? developmentFallback,
  );
  return new URL(value).origin;
}

export function getPsnTrophyLocale(env: NodeJS.ProcessEnv = process.env): string {
  const locale = (env.PSN_TROPHY_LOCALE ?? "it-IT").trim();
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
    throw new Error("PSN_TROPHY_LOCALE must use a language-region value such as it-IT");
  }
  return locale;
}

export function getLibrarySyncPolicy(env: NodeJS.ProcessEnv = process.env) {
  return {
    minIntervalSeconds: boundedInteger(
      "LIBRARY_SYNC_MIN_INTERVAL_SECONDS",
      env.LIBRARY_SYNC_MIN_INTERVAL_SECONDS,
      3600,
      60,
      86_400,
    ),
    maxGamesPerSync: boundedInteger(
      "LIBRARY_SYNC_MAX_GAMES",
      env.LIBRARY_SYNC_MAX_GAMES,
      2000,
      1,
      2000,
    ),
    staleRunAfterSeconds: boundedInteger(
      "LIBRARY_SYNC_STALE_AFTER_SECONDS",
      env.LIBRARY_SYNC_STALE_AFTER_SECONDS,
      600,
      60,
      3600,
    ),
  };
}

export function getGameSyncPolicy(env: NodeJS.ProcessEnv = process.env) {
  return {
    minIntervalSeconds: boundedInteger(
      "GAME_SYNC_MIN_INTERVAL_SECONDS",
      env.GAME_SYNC_MIN_INTERVAL_SECONDS,
      300,
      60,
      86_400,
    ),
    maxGroupsPerSync: boundedInteger(
      "GAME_SYNC_MAX_GROUPS",
      env.GAME_SYNC_MAX_GROUPS,
      100,
      1,
      100,
    ),
    maxTrophiesPerSync: boundedInteger(
      "GAME_SYNC_MAX_TROPHIES",
      env.GAME_SYNC_MAX_TROPHIES,
      1000,
      1,
      1000,
    ),
    staleRunAfterSeconds: boundedInteger(
      "GAME_SYNC_STALE_AFTER_SECONDS",
      env.GAME_SYNC_STALE_AFTER_SECONDS,
      600,
      60,
      3600,
    ),
  };
}

export function getAiContextPolicy(env: NodeJS.ProcessEnv = process.env) {
  return {
    freshnessSeconds: boundedInteger(
      "AI_CONTEXT_FRESHNESS_SECONDS",
      env.AI_CONTEXT_FRESHNESS_SECONDS,
      600,
      60,
      86_400,
    ),
    maxRefreshesPerHour: boundedInteger(
      "AI_CONTEXT_MAX_REFRESHES_PER_HOUR",
      env.AI_CONTEXT_MAX_REFRESHES_PER_HOUR,
      12,
      1,
      120,
    ),
    maxMissingTrophies: boundedInteger(
      "AI_CONTEXT_MAX_MISSING_TROPHIES",
      env.AI_CONTEXT_MAX_MISSING_TROPHIES,
      200,
      10,
      1000,
    ),
  };
}
