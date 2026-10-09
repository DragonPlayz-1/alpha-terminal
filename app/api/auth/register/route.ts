import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiSuccess, isUniqueConstraintError } from "@/lib/http";
import { createSession } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { createTradingAccount, ensureDefaultInstruments } from "@/server/auth/account";
import { clientRateKey } from "@/server/security/request";

const schema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 bytes."),
  initialCapital: z.coerce.number().min(100).max(1_000_000),
}).strict();

export async function POST(request: NextRequest) {
  const ip = clientRateKey(request);
  const rate = await enforceRateLimit(`register:${ip}`, 8, 60_000);
  if (!rate.allowed) return apiError("Too many registration attempts. Please try again shortly.", 429, "RATE_LIMITED");

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON body."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid registration details.");

  const email = parsed.data.email.toLowerCase();
  const username = parsed.data.username.toLowerCase();
  const existing = await db.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true, username: true } });
  if (existing?.email === email) return apiError("An account with that email already exists.", 409, "EMAIL_TAKEN");
  if (existing?.username === username) return apiError("That username is already in use.", 409, "USERNAME_TAKEN");

  const passwordHash = await hashPassword(parsed.data.password);
  let user;
  try {
    user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          preferences: { create: {} },
        },
      });
      await createTradingAccount(created.id, parsed.data.initialCapital, tx);
      await ensureDefaultInstruments(tx);
      const instruments = await tx.instrument.findMany({ where: { symbol: { in: ["BTC-USD", "ETH-USD", "SOL-USD"] } }, select: { id: true }, orderBy: { symbol: "asc" } });
      await tx.watchlist.create({
        data: {
          userId: created.id,
          name: "Core markets",
          isDefault: true,
          items: { create: instruments.map((instrument, index) => ({ instrumentId: instrument.id, sortOrder: index })) },
        },
      });
      await tx.auditLog.create({ data: { userId: created.id, action: "ACCOUNT_CREATED", entityType: "User", entityId: created.id } });
      return created;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return apiError("That email or username is already in use.", 409, "ACCOUNT_EXISTS");
    throw error;
  }

  await createSession(user.id);
  return apiSuccess({ user: { id: user.id, username: user.username, email: user.email } }, 201);
}
