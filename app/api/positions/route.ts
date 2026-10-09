import { apiError, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { getPortfolio } from "@/server/trading/service";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
  try {
    const portfolio = await getPortfolio(user.id, scope);
    return apiSuccess({ positions: portfolio.positions });
  } catch {
    return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
  }
}
