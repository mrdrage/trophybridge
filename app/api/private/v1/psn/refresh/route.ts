import { privateJson, psnErrorResponse, unauthorizedResponse } from "@/lib/api/private-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createPsnConnectionService } from "@/lib/psn/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const session = await createPsnConnectionService().refreshAuthorization(user.id);
    return privateJson({
      account: {
        onlineId: session.account.psnOnlineId,
        authStatus: session.account.authStatus,
        preferredLocale: session.account.preferredLocale,
      },
      accessAuthorizationExpiresAt: session.accessTokenExpiresAt,
    });
  } catch (error) {
    return psnErrorResponse(error);
  }
}
