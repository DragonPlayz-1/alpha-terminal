import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { destroySession, getCurrentSession } from "@/server/auth/session";

const bodySchema = z.object({ id: z.string().cuid().optional(), revokeOthers: z.boolean().optional() }).strict();

export async function GET() {
  try {
    const current = await getCurrentSession();
    if (!current) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const sessions = await db.session.findMany({ where: { userId: current.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, expiresAt: true } });
    return apiSuccess({ sessions: sessions.map(session => ({ ...session, createdAt: session.createdAt.toISOString(), expiresAt: session.expiresAt.toISOString(), current: session.id === current.id })) });
  } catch (error) {
    return apiException(error, "Unable to load active sessions.", 503, "SESSIONS_UNAVAILABLE");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const current = await getCurrentSession();
    if (!current) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success || (!parsed.data.id && !parsed.data.revokeOthers)) return apiError("Choose a session to revoke.", 400, "SESSION_REQUIRED");
    if (parsed.data.revokeOthers) {
      await db.session.deleteMany({ where: { userId: current.userId, id: { not: current.id } } });
      return apiSuccess({ revoked: "others" });
    }
    if (parsed.data.id === current.id) {
      await destroySession();
      return apiSuccess({ revoked: "current", loggedOut: true });
    }
    const deleted = await db.session.deleteMany({ where: { id: parsed.data.id, userId: current.userId } });
    return apiSuccess({ revoked: deleted.count ? "session" : "none" });
  } catch (error) {
    return apiException(error, "Unable to revoke the session.", 503, "SESSION_REVOKE_UNAVAILABLE");
  }
}
