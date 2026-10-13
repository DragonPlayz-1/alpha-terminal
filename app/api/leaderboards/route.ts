import { NextRequest } from "next/server";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { leaderboard } from "@/server/competition/service";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") ?? "all-time";
    if (!["all-time", "realized", "win-rate"].includes(type)) return apiError("Invalid leaderboard type.", 400, "INVALID_LEADERBOARD");
    const entries = await leaderboard(type);
    return apiSuccess({ type, entries: entries.map(({ userId: _userId, ...entry }) => entry) });
  } catch (error) {
    return apiException(error, "Leaderboard is temporarily unavailable.", 503, "LEADERBOARD_UNAVAILABLE");
  }
}
