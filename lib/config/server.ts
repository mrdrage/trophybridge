function requireValue(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
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

export function getAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const developmentFallback =
    env.NODE_ENV === "development" || env.NODE_ENV === "test"
      ? "http://localhost:3000"
      : undefined;
  const value = requireValue("APP_URL", env.APP_URL ?? developmentFallback);
  return new URL(value).origin;
}

export function getPsnTrophyLocale(env: NodeJS.ProcessEnv = process.env): string {
  const locale = (env.PSN_TROPHY_LOCALE ?? "it-IT").trim();
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
    throw new Error("PSN_TROPHY_LOCALE must use a language-region value such as it-IT");
  }
  return locale;
}
