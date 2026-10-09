import { NextRequest } from "next/server";
import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { cancelOrder, getOrder } from "@/server/trading/service";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const { id } = await context.params;
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
  const order = await getOrder(user.id, id, scope);
  if (!order) return apiError("Order not found.", 404, "ORDER_NOT_FOUND");
  return apiSuccess({ order: { id: order.id, symbol: order.instrument.symbol, side: order.side, orderType: order.orderType, quantity: order.quantity.toString(), filledQuantity: order.filledQuantity.toString(), averageFillPrice: order.averageFillPrice?.toString() ?? null, status: order.status, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() } });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  try {
    const { id } = await context.params;
    const scope = request.nextUrl.searchParams.get("scope") ?? "main";
    if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const order = await cancelOrder(user.id, id, scope);
    return apiSuccess({ order: { id: order.id, status: order.status } });
  } catch (error) {
    return apiError(getErrorMessage(error), 400, "CANCEL_REJECTED");
  }
}
