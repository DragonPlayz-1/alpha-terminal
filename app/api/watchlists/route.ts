import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { refreshQuotes } from "@/server/market-data/service";
import { db } from "@/lib/db";

const createSchema = z.object({ name: z.string().trim().min(1).max(40), isDefault: z.boolean().optional() }).strict();

export async function GET() {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const watchlists = await db.watchlist.findMany({ where: { userId: user.id }, include: { items: { include: { instrument: { include: { quote: true } }, }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } });
  const symbols = watchlists.flatMap((watchlist) => watchlist.items.map((item) => item.instrument.symbol));
  if (symbols.length) await refreshQuotes(symbols).catch(() => undefined);
  const fresh = await db.watchlist.findMany({ where: { userId: user.id }, include: { items: { include: { instrument: { include: { quote: true } }, }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } });
  return apiSuccess({ watchlists: fresh.map((watchlist) => ({ id: watchlist.id, name: watchlist.name, isDefault: watchlist.isDefault, items: watchlist.items.map((item) => ({ id: item.id, sortOrder: item.sortOrder, instrument: { symbol: item.instrument.symbol, name: item.instrument.name, baseAsset: item.instrument.baseAsset, quote: item.instrument.quote ? { lastPrice: item.instrument.quote.lastPrice?.toString() ?? null, priceChangePct: item.instrument.quote.priceChangePct?.toString() ?? null } : null } })) })) });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("A watchlist name is required.");
  try {
    const watchlist = await db.$transaction(async tx => {
      if (parsed.data.isDefault) await tx.watchlist.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
      return tx.watchlist.create({ data: { userId: user.id, name: parsed.data.name, isDefault: parsed.data.isDefault ?? false } });
    });
    return apiSuccess({ watchlist }, 201);
  } catch (error) { if (isUniqueConstraintError(error)) return apiError("That watchlist already exists.", 409, "WATCHLIST_EXISTS"); throw error; }
}
