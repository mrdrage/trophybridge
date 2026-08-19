import { privateJson, psnErrorResponse, unauthorizedResponse } from "@/lib/api/private-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createPsnAuthRepository } from "@/lib/psn/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const account = await createPsnAuthRepository().getAccountForOwner(user.id);
    return privateJson({
      account: account
        ? {
            onlineId: account.psnOnlineId,
            authStatus: account.authStatus,
            preferredLocale: account.preferredLocale,
          }
        : null,
    });
  } catch (error) {
    return psnErrorResponse(error);
  }
}
