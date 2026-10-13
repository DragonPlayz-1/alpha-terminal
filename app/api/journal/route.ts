import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiException, apiSuccess, getErrorMessage } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { journalAccount as accountFor, journalContentSchema } from "@/server/journal";

const entrySchema = journalContentSchema.extend({
  scope: z.string().trim().min(1).max(80).default("main"),
  orderId: z.string().cuid().optional().nullable(),
  instrumentSymbol: z.string().trim().toUpperCase().min(3).max(30).regex(/^[A-Z0-9-]+$/).optional().nullable(),
}).strict();

function serialize(entry: { id: string; scope?: string; title: string | null; notes: string; tags: unknown; emotionalState: string | null; outcome: string | null; orderId: string | null; instrumentId: string | null; createdAt: Date; updatedAt: Date; order?: { id: string; side: string; orderType: string; instrument: { symbol: string } } | null; instrument?: { symbol: string; name: string } | null }) {
  return { id: entry.id, scope: entry.scope ?? "main", title: entry.title, notes: entry.notes, tags: Array.isArray(entry.tags) ? entry.tags : [], emotionalState: entry.emotionalState, outcome: entry.outcome, orderId: entry.orderId, instrumentId: entry.instrumentId, symbol: entry.instrument?.symbol ?? entry.order?.instrument.symbol ?? null, instrumentName: entry.instrument?.name ?? null, order: entry.order ? { id: entry.order.id, side: entry.order.side, orderType: entry.order.orderType, symbol: entry.order.instrument.symbol } : null, createdAt: entry.createdAt.toISOString(), updatedAt: entry.updatedAt.toISOString() };
}

export async function GET(request: NextRequest) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const scope = request.nextUrl.searchParams.get("scope") ?? "main";
  if (!scope || scope.length > 80) return apiError("Invalid account scope.", 400, "INVALID_SCOPE");
    const account = await accountFor(user.id, scope);
    const entries = await db.tradeJournalEntry.findMany({ where: { userId: user.id, accountId: account.id }, include: { order: { include: { instrument: { select: { symbol: true } } } }, instrument: { select: { symbol: true, name: true } } }, orderBy: { updatedAt: "desc" }, take: 500 });
    return apiSuccess({ entries: entries.map(entry => serialize({ ...entry, scope })) });
  } catch (error) {
    if (getErrorMessage(error) === "Trading account unavailable.") return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
    return apiException(error, "Unable to load the trade journal.", 503, "JOURNAL_UNAVAILABLE");
  }
}

export async function POST(request: NextRequest) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid journal entry.", 400, "INVALID_JOURNAL_ENTRY");
    const account = await accountFor(user.id, parsed.data.scope);
    let instrumentId: string | null = null;
    if (parsed.data.instrumentSymbol) {
      const instrument = await db.instrument.findUnique({ where: { symbol: parsed.data.instrumentSymbol.toUpperCase() }, select: { id: true } });
      if (!instrument) return apiError("Instrument not found.", 404, "INSTRUMENT_NOT_FOUND");
      instrumentId = instrument.id;
    }
    if (parsed.data.orderId) {
      const order = await db.order.findFirst({ where: { id: parsed.data.orderId, accountId: account.id }, select: { instrumentId: true } });
      if (!order) return apiError("Order not found in this account.", 404, "ORDER_NOT_FOUND");
      if (instrumentId && instrumentId !== order.instrumentId) return apiError("Journal instrument must match the linked order.", 400, "JOURNAL_INSTRUMENT_MISMATCH");
      instrumentId = order.instrumentId;
    }
    const entry = await db.tradeJournalEntry.create({ data: { userId: user.id, accountId: account.id, orderId: parsed.data.orderId ?? null, instrumentId, title: parsed.data.title || null, notes: parsed.data.notes, tags: parsed.data.tags, emotionalState: parsed.data.emotionalState ?? null, outcome: parsed.data.outcome ?? null }, include: { order: { include: { instrument: { select: { symbol: true } } } }, instrument: { select: { symbol: true, name: true } } } });
    return apiSuccess({ entry: serialize({ ...entry, scope: parsed.data.scope }) }, 201);
  } catch (error) {
    if (getErrorMessage(error) === "Trading account unavailable.") return apiError("Trading account unavailable.", 404, "ACCOUNT_NOT_FOUND");
    return apiException(error, "Unable to create the journal entry.", 503, "JOURNAL_CREATE_UNAVAILABLE");
  }
}
