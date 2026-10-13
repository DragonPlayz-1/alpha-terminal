import { apiError, apiException, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { getPortfolio } from "@/server/trading/service";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  try {
    const scope = request.nextUrl.searchParams.get("scope") ?? "main";
    if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const portfolio = await getPortfolio(user.id, scope);
    return apiSuccess({
      equity: portfolio.equity,
      spotValue: portfolio.spotValue,
      returnPct: portfolio.returnPct,
      unrealizedPnl: portfolio.unrealizedPnl,
      margin: portfolio.margin,
      derivativesPnl: portfolio.derivativesPnl,
      complete: portfolio.complete,
      account: { initialCapital: portfolio.account.initialCapital.toString(), availableCash: portfolio.account.availableCash.toString(), reservedCash: portfolio.account.reservedCash.toString(), realizedPnl: portfolio.account.realizedPnl.toString(), feesPaid: portfolio.account.feesPaid.toString() },
      positions: portfolio.positions,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Trading account unavailable.") return apiError(error.message, 404, "ACCOUNT_NOT_FOUND");
    return apiException(error, getErrorMessage(error), 503, "PORTFOLIO_UNAVAILABLE");
  }
}
