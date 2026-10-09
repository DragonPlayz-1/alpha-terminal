import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { trader } from "../fixtures";
import { consumeRecoveryToken, issueRecoveryToken, recoveryHash } from "@/server/auth/recovery";
import { verifyPassword } from "@/server/auth/password";

describe("recovery token lifecycle", () => {
  it("stores only a hash, replaces older links, and consumes a verification token once", async () => {
    const { user } = await trader();
    const old = await issueRecoveryToken(user.id, "verify");
    const token = await issueRecoveryToken(user.id, "verify");
    expect(await db.passwordToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await db.passwordToken.findFirstOrThrow({ where: { userId: user.id } })).tokenHash).toBe(recoveryHash(token));
    await expect(consumeRecoveryToken(old, "verify")).rejects.toThrow("Invalid");
    const results = await Promise.allSettled([consumeRecoveryToken(token, "verify"), consumeRecoveryToken(token, "verify")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
  });

  it("rejects wrong-kind, expired, and oversized passwords; reset revokes all sessions", async () => {
    const { user } = await trader();
    const token = await issueRecoveryToken(user.id, "reset");
    await db.session.create({ data: { userId: user.id, tokenHash: "old-session", expiresAt: new Date(Date.now() + 100000) } });
    await expect(consumeRecoveryToken(token, "verify")).rejects.toThrow("Invalid");
    await expect(consumeRecoveryToken(token, "reset", "é".repeat(40))).rejects.toThrow("Invalid password");
    await consumeRecoveryToken(token, "reset", "new-account-password");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await verifyPassword("new-account-password", (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true);
    const expired = await issueRecoveryToken(user.id, "reset");
    await db.passwordToken.update({ where: { tokenHash: recoveryHash(expired) }, data: { expiresAt: new Date(0) } });
    await expect(consumeRecoveryToken(expired, "reset", "another-password")).rejects.toThrow("Invalid");
  });
});
