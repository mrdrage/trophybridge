import { librarySyncErrorResponse } from "@/lib/api/library-response";
import { privateJson, unauthorizedResponse } from "@/lib/api/private-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createLibrarySyncService } from "@/lib/library/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const summary = await createLibrarySyncService().sync(user.id);
    return privateJson({ summary });
  } catch (error) {
    return librarySyncErrorResponse(error);
  }
}
