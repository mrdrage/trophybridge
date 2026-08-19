import { getLibrarySyncPolicy } from "../config/server";
import { createPsnAuthRepository, createPsnConnectionService } from "../psn/runtime";
import { createSupabaseAdminClient } from "../supabase/admin";
import { SupabaseLibraryRepository } from "./repository";
import { LibrarySyncService } from "./service";

export function createLibraryRepository() {
  return new SupabaseLibraryRepository(createSupabaseAdminClient());
}

export function createLibrarySyncService() {
  const connectionService = createPsnConnectionService();
  return new LibrarySyncService(
    createPsnAuthRepository(),
    createLibraryRepository(),
    (ownerUserId) => connectionService.createProviderForOwner(ownerUserId),
    getLibrarySyncPolicy(),
  );
}
