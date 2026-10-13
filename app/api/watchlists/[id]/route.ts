import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { db } from "@/lib/db";

const schema = z.object({ name: z.string().trim().min(1).max(40).optional(), isDefault: z.boolean().optional(), itemOrder: z.array(z.object({ id: z.string().cuid(), sortOrder: z.number().int().min(0).max(199) }).strict()).max(200).optional() }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid watchlist details.");
    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const watchlist = await tx.watchlist.findFirst({ where: { id, userId: user.id }, include: { items: true } });
      if (!watchlist) return apiError("Watchlist not found.", 404);
      const order = parsed.data.itemOrder;
      if (order && (order.length !== watchlist.items.length || new Set(order.map(item => item.id)).size !== order.length || new Set(order.map(item => item.sortOrder)).size !== order.length || order.some(item => item.sortOrder >= order.length || !watchlist.items.some(existing => existing.id === item.id)))) return apiError("Provide each watchlist item exactly once in the new order.");
      if (parsed.data.isDefault) await tx.watchlist.updateMany({ where: { userId: user.id, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      await tx.watchlist.update({ where: { id }, data: { name: parsed.data.name, isDefault: parsed.data.isDefault } });
      for (const item of order ?? []) await tx.watchlistItem.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
      return apiSuccess({ saved: true });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return apiError("That watchlist name is already in use.", 409, "WATCHLIST_EXISTS");
    return apiException(error, "Unable to update the watchlist.", 503, "WATCHLIST_UPDATE_UNAVAILABLE");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const { id } = await context.params;
    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const watchlist = await tx.watchlist.findFirst({ where: { id, userId: user.id } });
      if (!watchlist) return apiError("Watchlist not found.", 404);
      await tx.watchlist.delete({ where: { id } });
      if (watchlist.isDefault) { const next = await tx.watchlist.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }); if (next) await tx.watchlist.update({ where: { id: next.id }, data: { isDefault: true } }); }
      return apiSuccess({ deleted: true });
    });
  } catch (error) { return apiException(error, "Unable to delete the watchlist.", 503, "WATCHLIST_DELETE_UNAVAILABLE"); }
}
