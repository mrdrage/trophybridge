import { privateJson, psnErrorResponse, unauthorizedResponse } from "@/lib/api/private-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { PsnConnectionError } from "@/lib/psn/connection-errors";
import { ShareError } from "@/lib/sharing/errors";
import { createShareService } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateShareError(error: unknown) {
  if (error instanceof PsnConnectionError) return psnErrorResponse(error);
  if (error instanceof ShareError) {
    return privateJson(
      { error: { code: error.code, message: error.message, retryable: false } },
      { status: error.httpStatus },
    );
  }
  return privateJson(
    {
      error: {
        code: "SHARE_FAILED",
        message: "Gestione del link pubblico non riuscita.",
        retryable: true,
      },
    },
    { status: 500 },
  );
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  try {
    const share = await createShareService().getOwnerStatus(user.id);
    return privateJson({ share });
  } catch (error) {
    return privateShareError(error);
  }
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  try {
    const share = await createShareService().rotateOwnerLink(user.id);
    return privateJson({ share });
  } catch (error) {
    return privateShareError(error);
  }
}

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();
  try {
    const share = await createShareService().revokeOwnerLink(user.id);
    return privateJson({ share });
  } catch (error) {
    return privateShareError(error);
  }
}
