import { apiError, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { getPortfolioHistory } from "@/server/trading/service";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
  try {
    const history = await getPortfolioHistory(user.id, scope);
    return apiSuccess({ history: history.map((snapshot) => ({ timestamp: snapshot.snapshotTimestamp.toISOString(), equity: snapshot.equity.toString(), cashBalance: snapshot.cashBalance.toString(), realizedPnl: snapshot.realizedPnl.toString(), unrealizedPnl: snapshot.unrealizedPnl.toString() })) });
  } catch {
    return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
  }
}
