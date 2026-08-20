import { z } from "zod";

import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import { ShareError } from "@/lib/sharing/errors";
import { createShareService } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gameIdSchema = z.string().uuid();
const querySchema = z.object({
  scope: z.enum(["base", "dlc", "all"]).default("all"),
  status: z.enum(["earned", "missing", "all"]).default("all"),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; gameId: string }> },
) {
  const { token, gameId: rawGameId } = await params;
  const gameId = gameIdSchema.safeParse(rawGameId);
  if (!gameId.success) return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));

  const url = new URL(request.url);
  const query = querySchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!query.success) return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));

  try {
    return publicJson(
      await createShareService().getTrophies(
        token,
        gameId.data,
        query.data.scope,
        query.data.status,
      ),
    );
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
