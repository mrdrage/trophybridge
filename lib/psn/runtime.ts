import { createTokenCipherFromEnv } from "../crypto/token-encryption";
import { getPsnTrophyLocale } from "../config/server";
import { createSupabaseAdminClient } from "../supabase/admin";
import { PsnAuthClient } from "./auth-client";
import { SupabasePsnAuthRepository } from "./auth-repository";
import { PsnConnectionService } from "./connection-service";

export function createPsnAuthRepository() {
  return new SupabasePsnAuthRepository(createSupabaseAdminClient());
}

export function createPsnConnectionService() {
  return new PsnConnectionService(
    new PsnAuthClient(),
    createPsnAuthRepository(),
    createTokenCipherFromEnv(),
    getPsnTrophyLocale(),
  );
}
