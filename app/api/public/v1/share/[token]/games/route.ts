import { z } from "zod";

import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import { ShareError } from "@/lib/sharing/errors";
import { createShareService } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(2000).default(0),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return publicShareErrorResponse(new ShareError("INVALID_REQUEST"));

  try {
    return publicJson(
      await createShareService().listGames(token, parsed.data.limit, parsed.data.offset),
    );
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
