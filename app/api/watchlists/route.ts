import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { db } from "@/lib/db";

const createSchema = z.object({ name: z.string().trim().min(1).max(40), isDefault: z.boolean().optional() }).strict();

export async function GET() {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const watchlists = await db.watchlist.findMany({ where: { userId: user.id }, include: { items: { include: { instrument: { include: { quote: true } }, }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } });
    const fresh = watchlists;
    return apiSuccess({ watchlists: fresh.map((watchlist) => ({ id: watchlist.id, name: watchlist.name, isDefault: watchlist.isDefault, items: watchlist.items.map((item) => ({ id: item.id, sortOrder: item.sortOrder, instrument: { symbol: item.instrument.symbol, name: item.instrument.name, baseAsset: item.instrument.baseAsset, quote: item.instrument.quote ? { lastPrice: item.instrument.quote.lastPrice?.toString() ?? null, priceChangePct: item.instrument.quote.priceChangePct?.toString() ?? null } : null } })) })) });
  } catch (error) { return apiException(error, "Unable to load watchlists.", 503, "WATCHLISTS_UNAVAILABLE"); }
}

export async function POST(request: NextRequest) {
  try {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("A watchlist name is required.");
    const watchlist = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const count = await tx.watchlist.count({ where: { userId: user.id } });
      if (count >= 30) return null;
      if (parsed.data.isDefault) await tx.watchlist.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
      return tx.watchlist.create({ data: { userId: user.id, name: parsed.data.name, isDefault: count === 0 || parsed.data.isDefault === true } });
    });
    if (!watchlist) return apiError("You can create up to 30 watchlists.", 409, "WATCHLIST_LIMIT");
    return apiSuccess({ watchlist }, 201);
  } catch (error) { if (isUniqueConstraintError(error)) return apiError("That watchlist already exists.", 409, "WATCHLIST_EXISTS"); return apiException(error, "Unable to create the watchlist.", 503, "WATCHLIST_CREATE_UNAVAILABLE"); }
}
