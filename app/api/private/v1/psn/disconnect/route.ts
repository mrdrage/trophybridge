import { privateJson, psnErrorResponse, unauthorizedResponse } from "@/lib/api/private-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createPsnConnectionService } from "@/lib/psn/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const account = await createPsnConnectionService().disconnect(user.id);
    return privateJson({
      account: {
        onlineId: account.psnOnlineId,
        authStatus: account.authStatus,
        preferredLocale: account.preferredLocale,
      },
    });
  } catch (error) {
    return psnErrorResponse(error);
  }
}
