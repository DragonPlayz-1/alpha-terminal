import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { requireApiUser } from "@/server/auth/session";

const schema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
  avatarUrl: z.string().url().max(500).refine(value => ["http:", "https:"].includes(new URL(value).protocol), "Avatar URL must use HTTP or HTTPS.").nullable().optional(),
  publicProfile: z.boolean().optional(),
  publicHistory: z.boolean().optional(),
}).strict();

export async function GET() {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  return apiSuccess({ user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl, publicProfile: user.publicProfile, publicHistory: user.publicHistory, createdAt: user.createdAt } });
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid profile details.");
  const data = { ...parsed.data, ...(parsed.data.username ? { username: parsed.data.username.toLowerCase() } : {}) };
  if (data.username && data.username !== user.username) {
    const taken = await db.user.findUnique({ where: { username: data.username }, select: { id: true } });
    if (taken) return apiError("That username is already in use.", 409, "USERNAME_TAKEN");
  }
  try {
    const updated = await db.user.update({ where: { id: user.id }, data });
    return apiSuccess({ user: { id: updated.id, username: updated.username, email: updated.email, avatarUrl: updated.avatarUrl, publicProfile: updated.publicProfile, publicHistory: updated.publicHistory } });
  } catch (error) {
    if (isUniqueConstraintError(error)) return apiError("That username is already in use.", 409, "USERNAME_TAKEN");
    throw error;
  }
}
