import { getGameSyncPolicy } from "../config/server";
import { createPsnAuthRepository, createPsnConnectionService } from "../psn/runtime";
import { createSupabaseAdminClient } from "../supabase/admin";
import { SupabaseTrophyRepository } from "./repository";
import { TrophySyncService } from "./service";

export function createTrophyRepository() {
  return new SupabaseTrophyRepository(createSupabaseAdminClient());
}

export function createTrophySyncService() {
  const connectionService = createPsnConnectionService();
  return new TrophySyncService(
    createPsnAuthRepository(),
    createTrophyRepository(),
    (ownerUserId) => connectionService.createProviderForOwner(ownerUserId),
    getGameSyncPolicy(),
  );
}
