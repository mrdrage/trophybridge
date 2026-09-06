import { z } from "zod";

import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import { isAssistantBridgeAuthorized } from "@/lib/auth/assistant-bridge";
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
  if (!isAssistantBridgeAuthorized(request)) return unauthorized();

  const raw = await params;
  const psnAccountId = idSchema.safeParse(raw.psnAccountId);
  const gameId = idSchema.safeParse(raw.gameId);
  if (!psnAccountId.success || !gameId.success) {
    return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));
  }

  const url = new URL(request.url);
  const query = querySchema.safeParse({ fresh: url.searchParams.get("fresh") ?? undefined });
  if (!query.success) return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));

  try {
    const repository = createSharingRepository();
    const share = await repository.resolveActiveForAccount(psnAccountId.data);
    if (!share) throw new ShareError("INVALID_SHARE_TOKEN");

    const context = await createShareService().getAiContextForResolvedShare(
      share,
      gameId.data,
      query.data.fresh === "1",
    );
    return publicJson(context);
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
