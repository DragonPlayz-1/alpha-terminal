import { db } from "@/lib/db";
import { hashPassword } from "@/server/auth/password";
import { createTradingAccount, ensureDefaultInstruments } from "@/server/auth/account";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const username = (process.env.ADMIN_USERNAME ?? "operator").trim().toLowerCase();
  const initialCapital = Number(process.env.ADMIN_INITIAL_CAPITAL ?? 10000);
  if (!email || !password || password.length < 10 || Buffer.byteLength(password, "utf8") > 72 || !Number.isFinite(initialCapital) || initialCapital < 100 || initialCapital > 1_000_000) throw new Error("Set valid ADMIN_EMAIL, ADMIN_PASSWORD (10-72 bytes), and optional ADMIN_INITIAL_CAPITAL before running db:admin.");
  const passwordHash = await hashPassword(password);
  await db.$transaction(async tx => {
    const user = await tx.user.upsert({ where: { email }, create: { email, username, passwordHash, role: "ADMIN", preferences: { create: {} } }, update: { passwordHash, role: "ADMIN", accountStatus: "ACTIVE" } });
    const account = await tx.tradingAccount.findUnique({ where: { userId_scope: { userId: user.id, scope: "main" } } });
    if (!account) await createTradingAccount(user.id, initialCapital, tx);
    await ensureDefaultInstruments(tx);
  });
  console.log(`Admin account ready for ${email}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
