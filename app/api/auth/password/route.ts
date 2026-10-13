import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/http";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/server/auth/session";
import { hashPassword, verifyPassword } from "@/server/auth/password";

const password = z.string().min(10).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must be at most 72 bytes.");
const schema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: password, confirmation: z.string().min(1).max(72) }).strict();

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) return apiError("Authentication required.", 401, "UNAUTHENTICATED");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Enter valid password details.", 400, "INVALID_PASSWORD");
    if (parsed.data.newPassword !== parsed.data.confirmation) return apiError("New passwords do not match.", 400, "PASSWORD_MISMATCH");
    if (parsed.data.currentPassword === parsed.data.newPassword) return apiError("Choose a new password different from the current password.", 400, "PASSWORD_UNCHANGED");
    if (!await verifyPassword(parsed.data.currentPassword, session.user.passwordHash)) return apiError("Current password is incorrect.", 401, "CURRENT_PASSWORD_INCORRECT");
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${session.userId} FOR UPDATE`;
      await tx.user.update({ where: { id: session.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: session.userId, id: { not: session.id } } });
      await tx.auditLog.create({ data: { userId: session.userId, action: "PASSWORD_CHANGED", entityType: "User", entityId: session.userId } });
    });
    return apiSuccess({ changed: true, revokedOtherSessions: true });
  } catch (error) {
    return apiException(error, "Unable to change your password.", 503, "PASSWORD_CHANGE_UNAVAILABLE");
  }
}
