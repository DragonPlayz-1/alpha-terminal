import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/http";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { clientRateKey, appOrigin } from "@/server/security/request";
import { consumeRecoveryToken, issueRecoveryToken, recoveryHash } from "@/server/auth/recovery";
import { env } from "@/lib/env";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
const password = z.string().min(10).max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72, "Password must be at most 72 bytes.");
export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!["forgot-password", "send-verification", "reset-password", "verify-email"].includes(action)) return apiError("Unknown action.", 404);
  if (!(await enforceRateLimit(`recovery:${clientRateKey(request)}`, 10)).allowed) return apiError("Too many requests.", 429, "RATE_LIMITED");
  const body = await request.json().catch(() => null);
  if (["forgot-password", "send-verification"].includes(action)) {
    if (!env.SMTP_URL || !env.MAIL_FROM) return apiError("Email delivery is unavailable.", 503, "EMAIL_NOT_CONFIGURED");
    const parsed = z.object({ email: z.string().trim().email().max(320) }).strict().safeParse(body);
    if (!parsed.success) return apiError("A valid email is required.");
    const email = parsed.data.email.toLowerCase();
    if (!(await enforceRateLimit(`recovery-email:${recoveryHash(email)}`, 5)).allowed) return apiError("Too many requests.", 429, "RATE_LIMITED");
    const user = await db.user.findUnique({ where: { email } });
    if (user?.accountStatus === "ACTIVE") {
      const kind = action === "forgot-password" ? "reset" : "verify";
      const token = await issueRecoveryToken(user.id, kind);
      const link = `${appOrigin()}/reset-password?kind=${kind}&token=${token}`;
      try {
        transport ??= nodemailer.createTransport({ url: env.SMTP_URL, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
        await transport.sendMail({ from: env.MAIL_FROM, to: email, subject: `ALPHA TERMINAL: ${kind === "reset" ? "Reset password" : "Verify email"}`, text: `Use this single-use link within one hour: ${link}` });
      } catch {
        // Keep the response independent of account existence on mail failures.
        console.error(JSON.stringify({ event: "email_delivery_failed", kind }));
      }
    }
    return apiSuccess({ message: "If the account exists, a link has been sent." });
  }
  const parsed = (action === "reset-password"
    ? z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).strict()
    : z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).safeParse(body);
  if (!parsed.success) return apiError("Invalid recovery request.");
  try {
    await consumeRecoveryToken(parsed.data.token, action === "reset-password" ? "reset" : "verify", "password" in parsed.data && typeof parsed.data.password === "string" ? parsed.data.password : undefined);
    return apiSuccess({ message: "Account updated. You can now sign in." });
  } catch { return apiError("Invalid, used, or expired token."); }
}
