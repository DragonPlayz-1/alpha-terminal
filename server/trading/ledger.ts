import type { LedgerEntryType, LedgerTransactionType } from "@prisma/client";
import { D, fixed } from "./math";
import type { Decimal } from "@/lib/decimal";
import type { Tx } from "./transaction";
import { db } from "@/lib/db";

export async function postLedger(tx: Tx, accountId: string, type: LedgerTransactionType, reference: string, description: string, entries: { type: LedgerEntryType; asset: string; amount: Decimal }[]) {
  await tx.ledgerTransaction.create({ data: {
    accountId, transactionType: type, referenceType: "Settlement", referenceId: reference, description,
    entries: { create: entries.map(e => ({ accountId, entryType: e.type, assetCode: e.asset, amount: fixed(e.amount) })) },
  } });
}
export async function reconcile(accountId: string, client?: Tx) {
  return client ? readReconciliation(accountId, client) : db.$transaction(tx => readReconciliation(accountId, tx), { isolationLevel: "RepeatableRead", timeout: 15000 });
}
async function readReconciliation(accountId: string, client: Tx) {
  const account = await client.tradingAccount.findUniqueOrThrow({ where: { id: accountId } });
  const [cash, margins, positions, inventory, orders] = await Promise.all([
    client.ledgerEntry.aggregate({ where: { accountId, entryType: { in: ["CASH", "FEE"] }, assetCode: "USD" }, _sum: { amount: true } }),
    client.ledgerEntry.aggregate({ where: { accountId, entryType: "MARGIN" }, _sum: { amount: true } }),
    client.position.findMany({ where: { accountId }, include: { instrument: true } }),
    client.ledgerEntry.groupBy({ by: ["assetCode"], where: { accountId, entryType: "ASSET" }, _sum: { amount: true } }),
    client.order.findMany({ where: { accountId, status: { in: ["OPEN", "PENDING", "PARTIALLY_FILLED"] } } }),
  ]);
  const cashDelta = D(cash._sum.amount ?? 0).minus(account.availableCash).minus(account.reservedCash);
  const marginDelta = D(margins._sum.amount ?? 0).minus(positions.reduce((s, p) => s.plus(p.initialMargin), D(0)));
  const actual = new Map<string, Decimal>();
  for (const row of inventory) {
    // v0 used base-asset inventory keys; normalize for diagnostics without rewriting the ledger.
    const key = row.assetCode.includes(":") ? row.assetCode : `${row.assetCode}-USD:LONG`;
    actual.set(key, (actual.get(key) ?? D(0)).plus(row._sum.amount ?? 0));
  }
  for (const p of positions) {
    const key = `${p.instrument.symbol}:${p.positionSide}`;
    actual.set(key, (actual.get(key) ?? D(0)).minus(p.quantity));
  }
  const inventoryErrors = [...actual].filter(([, qty]) => qty.abs().gt("0.000000001")).map(([key]) => key);
  const reservationDelta = orders.reduce((sum, order) => sum.plus(order.reservedAmount), D(0)).minus(account.reservedCash);
  const reservations = new Map<string, Decimal>();
  const groups = new Set<string>();
  for (const order of orders) {
    const group = order.orderGroupId ?? order.id;
    if (groups.has(group)) continue;
    groups.add(group);
    const key = `${order.instrumentId}:${order.positionSide}`;
    reservations.set(key, (reservations.get(key) ?? D(0)).plus(order.reservedQuantity));
  }
  const reservationErrors = [...reservations].filter(([key, quantity]) => quantity.gt(positions.find(p => `${p.instrumentId}:${p.positionSide}` === key)?.quantity ?? 0)).map(([key]) => key);
  return { accountId, ok: cashDelta.abs().lt("0.000000001") && marginDelta.abs().lt("0.000000001") && reservationDelta.isZero() && !inventoryErrors.length && !reservationErrors.length, cashDelta: cashDelta.toString(), marginDelta: marginDelta.toString(), reservationDelta: reservationDelta.toString(), inventoryErrors, reservationErrors };
}
