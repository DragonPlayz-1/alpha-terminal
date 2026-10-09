import { apiError, apiSuccess } from "@/lib/http";
import { challengeLeaderboard } from "@/server/competition/service";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; return apiSuccess({ entries: await challengeLeaderboard(id) }); } catch { return apiError("Challenge leaderboard unavailable.", 404); } }
