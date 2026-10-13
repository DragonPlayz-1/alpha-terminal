import type { OrderStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { Tx } from "./transaction";

export async function recordOrderEvent(
  tx: Tx,
  orderId: string,
  eventType: string,
  message: string,
  status?: OrderStatus,
  metadata?: Prisma.InputJsonValue,
) {
  return tx.orderEvent.create({ data: { orderId, eventType, message, status, metadata } });
}
