import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "./password";

export const recoveryHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function issueRecoveryToken(userId: string, kind: "reset" | "verify") {
  const token = randomBytes(32).toString("hex");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.passwordToken.deleteMany({ where: { userId, kind } });
    await tx.passwordToken.create({ data: { userId, kind, tokenHash: recoveryHash(token), expiresAt: new Date(Date.now() + 3600000) } });
  });
  return token;
}

export async function consumeRecoveryToken(token: string, kind: "reset" | "verify", password?: string) {
  if (kind === "reset" && (!password || password.length < 10 || Buffer.byteLength(password, "utf8") > 72)) throw new Error("Invalid password.");
  const passwordHash = kind === "reset" ? await hashPassword(password!) : undefined;
  await db.$transaction(async tx => {
    const candidate = await tx.passwordToken.findUnique({ where: { tokenHash: recoveryHash(token) } });
    if (!candidate) throw new Error("Invalid, used, or expired token.");
    // Serialize token replacement, consumption and session creation for a user.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: candidate.userId } });
    if (user.accountStatus !== "ACTIVE") throw new Error("Invalid, used, or expired token.");
    const consumed = await tx.passwordToken.deleteMany({ where: { id: candidate.id, kind, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) throw new Error("Invalid, used, or expired token.");
    await tx.user.update({ where: { id: user.id }, data: kind === "reset" ? { passwordHash } : { emailVerifiedAt: new Date() } });
    if (kind === "reset") {
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.passwordToken.deleteMany({ where: { userId: user.id, kind: "reset" } });
    }
    await tx.auditLog.create({ data: { userId: user.id, action: kind === "reset" ? "PASSWORD_RESET" : "EMAIL_VERIFIED", entityType: "User", entityId: user.id } });
  });
}
