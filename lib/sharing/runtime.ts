import { createPsnAuthRepository } from "../psn/runtime";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createTrophyRepository } from "../trophies/runtime";
import { SupabaseSharingRepository } from "./repository";
import { ShareService } from "./service";

export function createSharingRepository() {
  return new SupabaseSharingRepository(createSupabaseAdminClient());
}

export function createShareService() {
  return new ShareService(
    createPsnAuthRepository(),
    createSharingRepository(),
    createTrophyRepository(),
  );
}
