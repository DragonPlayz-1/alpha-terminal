import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { requireApiUser } from "@/server/auth/session";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const { id } = await context.params;
    const deleted = await db.priceAlert.deleteMany({ where: { id, userId: user.id } });
    if (!deleted.count) return apiError("Price alert not found.", 404, "ALERT_NOT_FOUND");
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiException(error, "Unable to delete the price alert.", 503, "ALERT_DELETE_UNAVAILABLE");
  }
}
