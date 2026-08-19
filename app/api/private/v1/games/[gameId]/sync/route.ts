import { z } from "zod";

import { privateJson, unauthorizedResponse } from "@/lib/api/private-response";
import { trophySyncErrorResponse } from "@/lib/api/trophy-response";
import { getAuthenticatedUser } from "@/lib/auth/require-user";
import { createTrophySyncService } from "@/lib/trophies/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gameIdSchema = z.string().uuid();

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { gameId: rawGameId } = await params;
  const gameId = gameIdSchema.safeParse(rawGameId);
  if (!gameId.success) {
    return privateJson(
      { error: { code: "INVALID_REQUEST", message: "Identificativo gioco non valido." } },
      { status: 400 },
    );
  }

  try {
    const summary = await createTrophySyncService().sync(user.id, gameId.data);
    return privateJson({ summary });
  } catch (error) {
    return trophySyncErrorResponse(error);
  }
}
