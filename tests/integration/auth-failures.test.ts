import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { isDatabaseError, apiException } from "@/lib/http";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as recover } from "@/app/api/auth/[action]/route";
import { GET as me } from "@/app/api/auth/me/route";
import { SESSION_COOKIE } from "@/server/auth/session";

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const outage = new Prisma.PrismaClientInitializationError("Private connection details", "6.12.0", "P1001");
const request = (path: string, body: object) => new NextRequest(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });

afterEach(() => { vi.restoreAllMocks(); cookieStore.get.mockReset(); cookieStore.set.mockReset(); });

describe("auth failure semantics", () => {
  it("returns service unavailable when database-backed rate limiting fails", async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValue(outage);
    for (const handler of [login, register]) {
      const response = await handler(request("/api/auth/login", { email: "test@example.test", password: "password" }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "DATABASE_UNAVAILABLE" } });
    }
  });

  it("distinguishes an unavailable session store from invalid credentials and expires the logout cookie", async () => {
    cookieStore.get.mockReturnValue({ value: randomBytes(32).toString("base64url") });
    vi.spyOn(db.session, "findUnique").mockRejectedValue(outage);
    expect((await me()).status).toBe(503);
    vi.spyOn(db.session, "deleteMany").mockRejectedValue(outage);
    expect((await logout()).status).toBe(503);
    expect(cookieStore.set).toHaveBeenCalledWith(SESSION_COOKIE, "", expect.objectContaining({ maxAge: 0, path: "/", httpOnly: true }));
  });

  it("does not report valid recovery tokens as expired during a database outage", async () => {
    vi.spyOn(db, "$transaction").mockRejectedValue(outage);
    const response = await recover(request("/api/auth/verify-email", { token: randomBytes(32).toString("hex") }), { params: Promise.resolve({ action: "verify-email" }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "DATABASE_UNAVAILABLE" } });
  });

  it("preserves conflict handling and never exposes internal exception messages", async () => {
    for (const code of ["P2002", "P2003", "P2025"]) {
      expect(isDatabaseError(new Prisma.PrismaClientKnownRequestError("Private database detail", { code, clientVersion: "6.12.0" }))).toBe(false);
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiException(new Error("private credentials"), "Sign-in is unavailable.", 503, "AUTH_UNAVAILABLE");
    expect(await response.json()).toEqual({ error: { code: "AUTH_UNAVAILABLE", message: "Sign-in is unavailable." } });
  });
});
