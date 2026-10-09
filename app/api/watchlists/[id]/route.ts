import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { db } from "@/lib/db";

const schema = z.object({ name: z.string().trim().min(1).max(40).optional(), isDefault: z.boolean().optional(), itemOrder: z.array(z.object({ id: z.string(), sortOrder: z.number().int().nonnegative() })).optional() }).strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const { id } = await context.params; const watchlist = await db.watchlist.findFirst({ where: { id, userId: user.id } }); if (!watchlist) return apiError("Watchlist not found.", 404);
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("Invalid watchlist details.");
  try {
    await db.$transaction(async tx => {
      if (parsed.data.isDefault) await tx.watchlist.updateMany({ where: { userId: user.id, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      await tx.watchlist.update({ where: { id }, data: { ...(parsed.data.name ? { name: parsed.data.name } : {}), ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}) } });
      for (const item of parsed.data.itemOrder ?? []) await tx.watchlistItem.updateMany({ where: { id: item.id, watchlistId: id }, data: { sortOrder: item.sortOrder } });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return apiError("That watchlist name is already in use.", 409, "WATCHLIST_EXISTS");
    throw error;
  }
  return apiSuccess({ saved: true });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED"); const { id } = await context.params; const deleted = await db.watchlist.deleteMany({ where: { id, userId: user.id } }); if (!deleted.count) return apiError("Watchlist not found.", 404); return apiSuccess({ deleted: true });
}
