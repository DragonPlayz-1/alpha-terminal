import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { getPortfolioAnalytics } from "@/server/trading/analytics";

export async function GET(request: NextRequest) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  const period = z.enum(["1d", "7d", "30d", "all"]).safeParse(request.nextUrl.searchParams.get("period") ?? "all");
  if (!period.success) return apiError("Invalid analytics period.", 400, "INVALID_PERIOD");
  if (!scope.length || scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
  return apiSuccess({ analytics: await getPortfolioAnalytics(user.id, scope, period.data) }); }
  catch (error) { if (getErrorMessage(error) === "Trading account unavailable.") return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND"); return apiException(error, "Portfolio analytics unavailable.", 503, "PORTFOLIO_ANALYTICS_UNAVAILABLE"); }
}
