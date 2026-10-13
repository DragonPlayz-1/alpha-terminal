import { db } from "@/lib/db";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const accounts = await db.tradingAccount.findMany({ where: { userId: user.id }, select: { scope: true, accountStatus: true }, orderBy: { createdAt: "asc" } });
    const challenges = await db.challenge.findMany({ where: { id: { in: accounts.filter(account => account.scope !== "main").map(account => account.scope) } }, select: { id: true, name: true, endTime: true } });
    return apiSuccess({ accounts: accounts.map(account => ({ scope: account.scope, name: account.scope === "main" ? "Main account" : challenges.find(challenge => challenge.id === account.scope)?.name ?? "Challenge account", status: account.accountStatus, ended: challenges.some(challenge => challenge.id === account.scope && challenge.endTime <= new Date()) })) });
  } catch (error) { return apiException(error, "Unable to load accounts.", 503, "ACCOUNTS_UNAVAILABLE"); }
}
