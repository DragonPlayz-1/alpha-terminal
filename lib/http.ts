import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
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
