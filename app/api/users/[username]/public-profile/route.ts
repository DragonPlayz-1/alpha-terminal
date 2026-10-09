import { apiError, apiSuccess } from "@/lib/http";
import { getPublicProfile } from "@/server/competition/service";

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  const profile = await getPublicProfile(username);
  if (!profile) return apiError("Public profile not available.", 404);
  return apiSuccess({ profile });
}
