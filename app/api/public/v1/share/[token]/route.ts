import { publicJson, publicShareErrorResponse } from "@/lib/api/public-response";
import { createShareService } from "@/lib/sharing/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    return publicJson(await createShareService().getDiscovery(token));
  } catch (error) {
    return publicShareErrorResponse(error);
  }
}
