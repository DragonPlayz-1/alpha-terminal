import { NextResponse, type NextRequest } from "next/server";
import { bodyWithinLimit, validMutationOrigin } from "@/server/security/request";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("X-Request-ID", crypto.randomUUID());
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!validMutationOrigin(request)) return NextResponse.json({ error: { code: "CSRF", message: "Cross-origin mutation rejected." } }, { status: 403 });
    if (!(await bodyWithinLimit(request))) return NextResponse.json({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large or incomplete." } }, { status: 413 });
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
