import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { db } from "@/lib/db";

const schema = z.object({ symbol: z.string().trim().min(3).max(20) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED"); const { id } = await context.params; const watchlist = await db.watchlist.findFirst({ where: { id, userId: user.id } }); if (!watchlist) return apiError("Watchlist not found.", 404);
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("A symbol is required."); const instrument = await db.instrument.findUnique({ where: { symbol: parsed.data.symbol.toUpperCase() } }); if (!instrument) return apiError("Instrument not found.", 404);
  const max = await db.watchlistItem.aggregate({ where: { watchlistId: id }, _max: { sortOrder: true } });
  try {
    const item = await db.watchlistItem.create({ data: { watchlistId: id, instrumentId: instrument.id, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    return apiSuccess({ item: { id: item.id, symbol: instrument.symbol } }, 201);
  } catch (error) {
    if (isUniqueConstraintError(error)) return apiError("That asset is already on the watchlist.", 409, "WATCHLIST_ITEM_EXISTS");
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED"); const { id } = await context.params; const watchlist = await db.watchlist.findFirst({ where: { id, userId: user.id } }); if (!watchlist) return apiError("Watchlist not found.", 404); const itemId = request.nextUrl.searchParams.get("itemId"); const symbol = request.nextUrl.searchParams.get("symbol"); if (!itemId && !symbol) return apiError("Provide itemId or symbol.", 400, "ITEM_REQUIRED"); const deleted = await db.watchlistItem.deleteMany({ where: { watchlistId: id, ...(itemId ? { id: itemId } : { instrument: { symbol: symbol!.toUpperCase() } }) } }); return apiSuccess({ deleted: deleted.count > 0 });
}
