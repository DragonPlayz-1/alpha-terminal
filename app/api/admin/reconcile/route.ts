import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";
import { reconcile } from "@/server/trading/ledger";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user || user.role !== "ADMIN") return apiError("Admin access required.", 403, "ADMIN_REQUIRED");
    const accounts = await db.tradingAccount.findMany({ select: { id: true } });
    const results = await Promise.all(accounts.map(account => reconcile(account.id)));
    return apiSuccess({ ok: results.every(result => result.ok), results });
  } catch (error) { return apiException(error, "Reconciliation is unavailable.", 503, "RECONCILIATION_UNAVAILABLE"); }
}
