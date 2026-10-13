import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiException } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { csvRow } from "@/lib/csv";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const parsed = z.object({ scope: z.string().min(1).max(80), dataset: z.enum(["executions", "snapshots", "journal"]) }).safeParse({ scope: request.nextUrl.searchParams.get("scope") ?? "main", dataset: request.nextUrl.searchParams.get("dataset") ?? "executions" });
    if (!parsed.success) return apiError("Invalid export request.");
    const account = await db.tradingAccount.findUnique({ where: { userId_scope: { userId: user.id, scope: parsed.data.scope } }, select: { id: true } });
    if (!account) return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
    const { dataset, scope } = parsed.data;
    const cutoff = new Date();
    async function* rows() {
      const columns = dataset === "executions" ? ["Execution ID", "Order ID", "Scope", "Symbol", "Side", "Position side", "Quantity", "Price", "Fee", "Fee asset", "Realized P&L", "Timestamp"] : dataset === "snapshots" ? ["Scope", "Timestamp", "Equity", "Cash", "Reserved cash", "Spot value", "Realized P&L", "Unrealized P&L"] : ["Entry ID", "Scope", "Order ID", "Title", "Notes", "Tags", "Emotional state", "Outcome", "Created", "Updated"];
      yield csvRow(columns);
      let cursor: string | undefined;
      for (;;) {
        if (request.signal.aborted) return;
        const paging = { take: 500, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
        if (dataset === "executions") {
          const page = await db.execution.findMany({ ...paging, where: { order: { accountId: account!.id }, executionTimestamp: { lte: cutoff } }, include: { order: { include: { instrument: { select: { symbol: true } } } } } });
          for (const row of page) yield csvRow([row.id, row.orderId, scope, row.order.instrument.symbol, row.order.side, row.order.positionSide, row.quantity, row.executionPrice, row.fee, row.feeAsset, row.realizedPnl, row.executionTimestamp.toISOString()]);
          if (page.length < 500) return;
          cursor = page.at(-1)!.id;
        } else if (dataset === "snapshots") {
          const page = await db.portfolioSnapshot.findMany({ ...paging, where: { accountId: account!.id, snapshotTimestamp: { lte: cutoff } } });
          for (const row of page) yield csvRow([scope, row.snapshotTimestamp.toISOString(), row.equity, row.cashBalance, row.reservedCash, row.spotValue, row.realizedPnl, row.unrealizedPnl]);
          if (page.length < 500) return;
          cursor = page.at(-1)!.id;
        } else {
          const page = await db.tradeJournalEntry.findMany({ ...paging, where: { accountId: account!.id, userId: user!.id, createdAt: { lte: cutoff } } });
          for (const row of page) yield csvRow([row.id, scope, row.orderId, row.title, row.notes, Array.isArray(row.tags) ? row.tags.join(", ") : "", row.emotionalState, row.outcome, row.createdAt.toISOString(), row.updatedAt.toISOString()]);
          if (page.length < 500) return;
          cursor = page.at(-1)!.id;
        }
      }
    }
    const iterator = rows(); const encoder = new TextEncoder();
    const stream = new ReadableStream({ async pull(controller) { try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(encoder.encode(next.value)); } catch (error) { controller.error(error); } }, async cancel() { await iterator.return(); } });
    return new Response(stream, { headers: { "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="alpha-terminal-${dataset}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiException(error, "Export unavailable.", 503, "EXPORT_UNAVAILABLE"); }
}
