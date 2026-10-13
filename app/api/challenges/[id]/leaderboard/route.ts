import { apiException, apiSuccess } from "@/lib/http";
import { challengeLeaderboard } from "@/server/competition/service";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params; return apiSuccess({ entries: await challengeLeaderboard(id) }); } catch (error) { return apiException(error, "Challenge leaderboard unavailable.", 503, "CHALLENGE_LEADERBOARD_UNAVAILABLE"); } }
