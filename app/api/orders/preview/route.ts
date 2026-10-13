import { NextRequest } from "next/server";
import { apiError, apiException, apiRateLimited, apiSuccess, getErrorMessage, isDatabaseError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { orderSchema, previewOrder } from "@/server/trading/service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    if (!(await enforceRateLimit(`preview:${user.id}`, 120)).allowed) return apiRateLimited();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return apiError("Invalid order preview.");
    const parsed = orderSchema.safeParse({ ...body, clientOrderId: "preview-only" });
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid order.");
    return apiSuccess({ preview: await previewOrder(user.id, parsed.data) });
  } catch (error) {
    const message = getErrorMessage(error);
    if (isDatabaseError(error) || message.startsWith("Unable to complete")) return apiException(error, "Order preview unavailable.", 503, "PREVIEW_UNAVAILABLE");
    return apiError(message, 409, "PREVIEW_REJECTED");
  }
}
