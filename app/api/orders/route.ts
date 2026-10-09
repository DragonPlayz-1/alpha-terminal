import { NextRequest } from "next/server";
import { apiError, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { createOrder, getOrders, getOrder, orderSchema } from "@/server/trading/service";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { D } from "@/server/trading/math";

function serializeOrder(o: Awaited<ReturnType<typeof getOrders>>[number]) {
  const executionFees = o.executions.reduce((sum, execution) => sum.plus(execution.fee), D(0));
  return { id: o.id, clientOrderId: o.clientOrderId, symbol: o.instrument.symbol, name: o.instrument.name, instrumentType: o.instrument.instrumentType, side: o.side, orderType: o.orderType, quantity: o.quantity.toString(), filledQuantity: o.filledQuantity.toString(), limitPrice: o.limitPrice?.toString() ?? null, stopPrice: o.stopPrice?.toString() ?? null, averageFillPrice: o.averageFillPrice?.toString() ?? null, estimatedFee: executionFees.gt(0) ? executionFees.toString() : o.estimatedFee?.toString() ?? null, reservedAmount: o.reservedAmount.toString(), reservedQuantity: o.reservedQuantity.toString(), status: o.status, timeInForce: o.timeInForce, reduceOnly: o.reduceOnly, triggeredAt: o.triggeredAt?.toISOString() ?? null, expiresAt: o.expiresAt?.toISOString() ?? null, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(), executions: o.executions.map(e => ({ id: e.id, quantity: e.quantity.toString(), executionPrice: e.executionPrice.toString(), fee: e.fee.toString(), realizedPnl: e.realizedPnl.toString(), executionTimestamp: e.executionTimestamp.toISOString() })) };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
  if (status && !["OPEN", "FILLED", "CANCELLED", "REJECTED", "EXPIRED", "PENDING", "PARTIALLY_FILLED", "all"].includes(status)) return apiError("Invalid order status.", 400, "INVALID_ORDER_STATUS");
  try {
    const orders = await getOrders(user.id, status, scope);
    return apiSuccess({ orders: orders.map(serializeOrder) });
  } catch {
    return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
  }
}
export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  if (!(await enforceRateLimit(`orders:${user.id}`, 30)).allowed) return apiError("Order rate limit reached.", 429);
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid order.");
  try { const created = await createOrder(user.id, parsed.data); const order = await getOrder(user.id, created.id, parsed.data.scope); return apiSuccess({ order: order ? serializeOrder(order) : created }, 201); }
  catch (error) {
    const message = getErrorMessage(error);
    if (message.startsWith("Unable to complete")) { return apiError(message, 503, "TRADING_UNAVAILABLE"); }
    return apiError(message, 409, "ORDER_REJECTED");
  }
}
