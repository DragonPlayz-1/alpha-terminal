import { NextResponse, type NextRequest } from "next/server";
import { bodyWithinLimit, validMutationOrigin } from "@/server/security/request";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const requestId = crypto.randomUUID();
  response.headers.set("X-Request-ID", requestId);
  const errorHeaders = { "X-Request-ID": requestId, "Cache-Control": "no-store" };
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!validMutationOrigin(request)) return NextResponse.json({ error: { code: "CSRF", message: "This address is not configured for sign-in or account changes. Open the configured app address or contact the operator." } }, { status: 403, headers: errorHeaders });
    if (!(await bodyWithinLimit(request))) return NextResponse.json({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large or incomplete." } }, { status: 413, headers: errorHeaders });
  }
  return response;
}

export const config = { matcher: "/api/:path*" };
