import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { db } from "@/lib/db";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const { id } = await context.params;
    const parsed = z.object({ symbol: z.string().trim().toUpperCase().min(3).max(30) }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("A symbol is required.");
    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (!await tx.watchlist.findFirst({ where: { id, userId: user.id } })) return apiError("Watchlist not found.", 404);
      const instrument = await tx.instrument.findUnique({ where: { symbol: parsed.data.symbol } });
      if (!instrument) return apiError("Instrument not found.", 404);
      const existing = await tx.watchlistItem.findUnique({ where: { watchlistId_instrumentId: { watchlistId: id, instrumentId: instrument.id } } });
      if (existing) return apiSuccess({ item: { id: existing.id, symbol: instrument.symbol } });
      if (await tx.watchlistItem.count({ where: { watchlistId: id } }) >= 200) return apiError("A watchlist supports up to 200 symbols.", 409);
      const max = await tx.watchlistItem.aggregate({ where: { watchlistId: id }, _max: { sortOrder: true } });
      const item = await tx.watchlistItem.create({ data: { watchlistId: id, instrumentId: instrument.id, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
      return apiSuccess({ item: { id: item.id, symbol: instrument.symbol } }, 201);
    });
  } catch (error) { return apiException(error, "Unable to add the asset to the watchlist.", 503, "WATCHLIST_ITEM_CREATE_UNAVAILABLE"); }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const { id } = await context.params;
    const itemId = request.nextUrl.searchParams.get("itemId"), symbol = request.nextUrl.searchParams.get("symbol");
    if (!itemId && !symbol) return apiError("Provide itemId or symbol.", 400, "ITEM_REQUIRED");
    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (!await tx.watchlist.findFirst({ where: { id, userId: user.id } })) return apiError("Watchlist not found.", 404);
      const deleted = await tx.watchlistItem.deleteMany({ where: { watchlistId: id, ...(itemId ? { id: itemId } : { instrument: { symbol: symbol!.toUpperCase() } }) } });
      return apiSuccess({ deleted: deleted.count > 0 });
    });
  } catch (error) { return apiException(error, "Unable to remove the watchlist item.", 503, "WATCHLIST_ITEM_DELETE_UNAVAILABLE"); }
}
