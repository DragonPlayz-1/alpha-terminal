import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, code = "BAD_REQUEST", extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export function apiRateLimited(message = "Too many requests. Please try again shortly.", retryAfterSeconds = 60) {
  return apiError(message, 429, "RATE_LIMITED", { "Retry-After": String(retryAfterSeconds) });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function isDatabaseError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; errorCode?: unknown; name?: unknown; message?: unknown };
  const code = candidate.code ?? candidate.errorCode;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  // Constraint, validation, and missing-record errors are not outages.
  return candidate.name === "PrismaClientInitializationError"
    || typeof code === "string" && ["P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1013", "P1017", "P2024", "P2037"].includes(code)
    || /can't reach database server|connection refused|ECONNREFUSED|ETIMEDOUT|timed out connecting/i.test(message);
}

export function apiException(error: unknown, fallback = "Unable to complete the request. Please try again.", fallbackStatus = 500, fallbackCode = "REQUEST_FAILED") {
  if (isDatabaseError(error)) return apiError("Database unavailable. Check PostgreSQL and DATABASE_URL, then try again.", 503, "DATABASE_UNAVAILABLE");
  console.error(JSON.stringify({ event: "api_request_failed", code: fallbackCode, errorName: error instanceof Error ? error.name : "UnknownError" }));
  return apiError(fallback, fallbackStatus, fallbackCode);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name.startsWith("Prisma") || /prisma|invocation|constraint|DATABASE_URL|Invalid value|Unique constraint/i.test(error.message)) {
      console.error(JSON.stringify({ event: "database_request_failed", name: error.name, code: "code" in error ? error.code : undefined }));
      return "Unable to complete the request. Please try again.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
