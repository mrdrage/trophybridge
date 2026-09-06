import { z } from "zod";

import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import {
  hashAssistantBridgeToken,
  readAssistantBridgeToken,
} from "@/lib/auth/assistant-bridge";
import { ShareError } from "@/lib/sharing/errors";
import { createShareService, createSharingRepository } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const querySchema = z.object({
  fresh: z.enum(["0", "1"]).default("1"),
});

function unauthorized() {
  return Response.json(
    { error: { code: "UNAUTHORIZED", message: "Unauthorized assistant bridge request." } },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ psnAccountId: string; gameId: string }> },
) {
  const token = readAssistantBridgeToken(request);
  if (!token) return unauthorized();

  const raw = await params;
  const psnAccountId = idSchema.safeParse(raw.psnAccountId);
  const gameId = idSchema.safeParse(raw.gameId);
  if (!psnAccountId.success || !gameId.success) return unauthorized();

  const url = new URL(request.url);
  const query = querySchema.safeParse({ fresh: url.searchParams.get("fresh") ?? undefined });
  if (!query.success) return unauthorized();
  const freshRequested = query.data.fresh === "1";

  try {
    const repository = createSharingRepository();
    const consumed = await repository.consumeAssistantBridgeRequest(
      hashAssistantBridgeToken(token),
      psnAccountId.data,
      gameId.data,
      freshRequested,
      new Date().toISOString(),
    );
    if (!consumed) return unauthorized();

    const share = await repository.resolveActiveForAccount(psnAccountId.data);
    if (!share) throw new ShareError("SHARE_LINK_REVOKED");

    const context = await createShareService().getAiContextForResolvedShare(
      share,
      gameId.data,
      freshRequested,
    );
    return publicJson(context);
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
