import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";
import { db } from "@/lib/db";
export async function GET() { const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401); const rows = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }); return apiSuccess({ notifications: rows }); }
export async function PATCH(request: NextRequest) { const user = await requireApiUser(); if (!user) return apiError("Authentication required.", 401); const parsed = z.object({ id: z.string().cuid().optional() }).strict().safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return apiError("Invalid notification request."); await db.notification.updateMany({ where: { userId: user.id, ...(parsed.data.id ? { id: parsed.data.id } : {}) }, data: { readAt: new Date() } }); return apiSuccess({ saved: true }); }
