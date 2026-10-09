import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-alpha_terminal_session" : "alpha_terminal_session";
const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHmac("sha256", env.SESSION_SECRET ?? "development-only-session-key").update(token).digest("hex");
}

export async function createSession(userId: string, expectedPasswordHash?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.accountStatus !== "ACTIVE" || expectedPasswordHash && user.passwordHash !== expectedPasswordHash) throw new Error("Credentials changed. Please sign in again.");
    await tx.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
    const oldSessions = await tx.session.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 10, select: { id: true } });
    if (oldSessions.length) await tx.session.deleteMany({ where: { id: { in: oldSessions.map(session => session.id) } } });
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return expiresAt;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookieStore.delete(SESSION_COOKIE);
}

export async function purgeExpiredSessions(now = new Date()) {
  const result = await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return result.count;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          preferences: true,
          tradingAccounts: { where: { scope: "main" }, take: 1 },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (session.user.accountStatus !== "ACTIVE") {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireApiUser() {
  return getCurrentUser();
}
