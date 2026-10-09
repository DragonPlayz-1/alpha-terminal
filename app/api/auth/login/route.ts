import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { clientRateKey } from "@/server/security/request";

const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72) }).strict();
const DUMMY_PASSWORD_HASH = "$2b$12$6ihC2pKt5sZTbtTqYkjJf.Bf1ROXumuh91bWWh3Rbkz3dH/rC5qf6";

export async function POST(request: NextRequest) {
  const ip = clientRateKey(request);
  const rate = await enforceRateLimit(`login:${ip}`, 15, 60_000);
  if (!rate.allowed) return apiError("Too many login attempts. Please try again shortly.", 429, "RATE_LIMITED");
  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON body."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("Enter a valid email and password.");
  const emailRate = await enforceRateLimit(`login-email:${createHash("sha256").update(parsed.data.email.toLowerCase()).digest("hex")}`, 15, 60_000);
  if (!emailRate.allowed) return apiError("Too many login attempts. Please try again shortly.", 429, "RATE_LIMITED");

  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const passwordMatches = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    return apiError("Email or password is incorrect.", 401, "INVALID_CREDENTIALS");
  }
  if (user.accountStatus !== "ACTIVE") return apiError("This account is not active.", 403, "ACCOUNT_DISABLED");
  try { await createSession(user.id, user.passwordHash); }
  catch { return apiError("Unable to sign in. Please try again.", 401, "SESSION_REJECTED"); }
  return apiSuccess({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
}
