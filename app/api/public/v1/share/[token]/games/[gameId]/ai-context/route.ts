import { z } from "zod";

import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import { ShareError } from "@/lib/sharing/errors";
import { createShareService } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gameIdSchema = z.string().uuid();
const querySchema = z.object({
  fresh: z.enum(["0", "1"]).default("0"),
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
    fresh: url.searchParams.get("fresh") ?? undefined,
  });
  if (!query.success) return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));

  try {
    return publicJson(
      await createShareService().getAiContext(token, gameId.data, query.data.fresh === "1"),
    );
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
