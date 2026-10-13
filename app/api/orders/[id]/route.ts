import { NextRequest } from "next/server";
import { apiError, apiException, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { cancelOrder, getOrder } from "@/server/trading/service";
import { D } from "@/server/trading/math";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const { id } = await context.params;
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const order = await getOrder(user.id, id, scope);
    if (!order) return apiError("Order not found.", 404, "ORDER_NOT_FOUND");
    return apiSuccess({ order: {
      id: order.id,
      clientOrderId: order.clientOrderId,
      scope: order.account.scope,
      symbol: order.instrument.symbol,
      name: order.instrument.name,
      side: order.side,
      orderType: order.orderType,
      status: order.status,
      instrumentType: order.instrument.instrumentType,
      linkedOrderId: order.linkedOrderId,
      positionSide: order.positionSide,
      leverage: order.leverage.toString(),
      reduceOnly: order.reduceOnly,
      timeInForce: order.timeInForce,
      quantity: order.quantity.toString(),
      filledQuantity: order.filledQuantity.toString(),
      limitPrice: order.limitPrice?.toString() ?? null,
      stopPrice: order.stopPrice?.toString() ?? null,
      averageFillPrice: order.averageFillPrice?.toString() ?? null,
      estimatedFee: order.executions.length ? order.executions.reduce((sum, execution) => sum.plus(execution.fee), D(0)).toString() : order.estimatedFee?.toString() ?? null,
      reservedAmount: order.reservedAmount.toString(),
      reservedQuantity: order.reservedQuantity.toString(),
      rejectionReason: order.rejectionReason,
      triggeredAt: order.triggeredAt?.toISOString() ?? null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      executions: order.executions.map(execution => ({ id: execution.id, quantity: execution.quantity.toString(), executionPrice: execution.executionPrice.toString(), fee: execution.fee.toString(), realizedPnl: execution.realizedPnl.toString(), executionTimestamp: execution.executionTimestamp.toISOString() })),
      events: order.events.map(event => ({ id: event.id, eventType: event.eventType, status: event.status, message: event.message, metadata: event.metadata, createdAt: event.createdAt.toISOString() })),
      linkedOrders: order.childOrders.map(child => ({ id: child.id, symbol: child.instrument.symbol, side: child.side, orderType: child.orderType, quantity: child.quantity.toString(), filledQuantity: child.filledQuantity.toString(), status: child.status, createdAt: child.createdAt.toISOString(), events: child.events.map(event => ({ id: event.id, eventType: event.eventType, status: event.status, message: event.message, createdAt: event.createdAt.toISOString() })) })),
    } });
  } catch (error) { return apiException(error, "Order unavailable.", 503, "ORDER_UNAVAILABLE"); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const { id } = await context.params;
    const scope = request.nextUrl.searchParams.get("scope") ?? "main";
    if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const order = await cancelOrder(user.id, id, scope);
    return apiSuccess({ order: { id: order.id, status: order.status } });
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.startsWith("Unable to complete")) return apiException(error, "Unable to cancel the order.", 503, "CANCEL_UNAVAILABLE");
    return apiError(message, 400, "CANCEL_REJECTED");
  }
}
