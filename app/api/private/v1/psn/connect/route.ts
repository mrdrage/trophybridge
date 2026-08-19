import { z } from "zod";

import { privateJson, psnErrorResponse, unauthorizedResponse } from "@/lib/api/private-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { getPsnTrophyLocale } from "@/lib/config/server";
import { createPsnConnectionService } from "@/lib/psn/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connectSchema = z.object({
  onlineId: z.string().trim().min(1).max(32),
  npsso: z.string().trim().min(32).max(512),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return privateJson(
      { error: { code: "INVALID_REQUEST", message: "Richiesta non valida." } },
      { status: 400 },
    );
  }

  const parsed = connectSchema.safeParse(payload);
  if (!parsed.success) {
    return privateJson(
      { error: { code: "INVALID_REQUEST", message: "ID PSN o NPSSO non valido." } },
      { status: 400 },
    );
  }

  try {
    const account = await createPsnConnectionService().connect({
      ownerUserId: user.id,
      onlineId: parsed.data.onlineId,
      npsso: parsed.data.npsso,
      locale: getPsnTrophyLocale(),
    });

    return privateJson({ account: safeAccount(account) });
  } catch (error) {
    return psnErrorResponse(error);
  }
}

function safeAccount(account: {
  psnOnlineId: string;
  authStatus: string;
  preferredLocale: string;
}) {
  return {
    onlineId: account.psnOnlineId,
    authStatus: account.authStatus,
    preferredLocale: account.preferredLocale,
  };
}
