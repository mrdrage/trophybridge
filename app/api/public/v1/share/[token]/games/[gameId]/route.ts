import { z } from "zod";

import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import { ShareError } from "@/lib/sharing/errors";
import { createShareService } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gameIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; gameId: string }> },
) {
  const { token, gameId: rawGameId } = await params;
  const gameId = gameIdSchema.safeParse(rawGameId);
  if (!gameId.success) return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));

  try {
    return publicJson(await createShareService().getGame(token, gameId.data));
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
