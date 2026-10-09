import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";

test.afterAll(() => db.$disconnect());
test("recovery emails, password reset, verification and session revocation in the browser", async ({ page, request }) => {
  const emails: string[] = [];
  const server = createServer(socket => {
    socket.setEncoding("utf8");
    socket.write("220 localhost SMTP acceptance test\r\n");
    let buffer = "", inData = false, message = "";
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n"), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") { emails.push(message); message = ""; inData = false; socket.write("250 accepted\r\n"); }
          else message += `${line}\n`;
        } else if (/^(EHLO|HELO)/.test(line)) socket.write("250 localhost\r\n");
        else if (line === "DATA") { inData = true; socket.write("354 send message\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(2526, "127.0.0.1"); await once(server, "listening");
  try {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const email = `${suffix}@example.test`, password = "original-test-password";
    expect((await request.post("/api/auth/register", { data: { username: `mail_${suffix}`, email, password, initialCapital: 10000 } })).status()).toBe(201);
    await page.goto("/forgot-password");
    await page.getByPlaceholder("you@example.com").fill(email);
    const [sent] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/auth/forgot-password")), page.getByRole("button", { name: "Send recovery link" }).click()]);
    expect(sent.status()).toBe(200);
    await expect.poll(() => emails.length).toBe(1);
    const token = emails[0].replace(/=\n/g, "").replace(/=3D/g, "=").match(/token=([a-f0-9]{64})/)?.[1];
    expect(token).toBeTruthy();
    await page.goto(`/reset-password?token=${token}`);
    await page.getByPlaceholder("10+ characters").fill("replacement-test-password");
    const [reset] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/auth/reset-password")), page.getByRole("button", { name: "Set new password" }).click()]);
    expect(reset.status()).toBe(200);
    expect((await request.get("/api/auth/me")).status()).toBe(401);
    expect((await request.post("/api/auth/reset-password", { data: { token, password: "replay-test-password" } })).status()).toBe(400);
    expect((await request.post("/api/auth/login", { data: { email, password } })).status()).toBe(401);
    expect((await request.post("/api/auth/login", { data: { email, password: "replacement-test-password" } })).status()).toBe(200);
    expect((await request.post("/api/auth/send-verification", { data: { email } })).status()).toBe(200);
    await expect.poll(() => emails.length).toBe(2);
    const verification = emails[1].replace(/=\n/g, "").replace(/=3D/g, "=").match(/token=([a-f0-9]{64})/)?.[1];
    expect(verification).toBeTruthy();
    await page.goto(`/reset-password?kind=verify&token=${verification}`);
    const [verified] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/auth/verify-email")), page.getByRole("button", { name: "Verify email" }).click()]);
    expect(verified.status()).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt).not.toBeNull();
  } finally { server.close(); await once(server, "close"); }
});
