import { apiError, apiException, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const account = user.tradingAccounts[0];
    return apiSuccess({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        createdAt: user.createdAt,
      },
      account: account ? {
        id: account.id,
        initialCapital: account.initialCapital.toString(),
        availableCash: account.availableCash.toString(),
        reservedCash: account.reservedCash.toString(),
        realizedPnl: account.realizedPnl.toString(),
        feesPaid: account.feesPaid.toString(),
      } : null,
    });
  } catch (error) {
    return apiException(error, "Unable to load your session.", 503, "SESSION_UNAVAILABLE");
  }
}
