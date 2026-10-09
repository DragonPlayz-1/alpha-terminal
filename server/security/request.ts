import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { env } from "@/lib/env";

export function appOrigin() {
  return new URL(env.APP_URL ?? env.NEXT_PUBLIC_APP_URL).origin;
}

export function trustedOrigins() {
  const canonical = new URL(appOrigin());
  const allowed = new Set([canonical.origin]);
  // Loopback aliases are useful for local production-mode acceptance tests.
  if (["localhost", "127.0.0.1", "[::1]"].includes(canonical.hostname)) {
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
      const alias = new URL(canonical); alias.hostname = hostname; allowed.add(alias.origin);
    }
  }
  for (const value of env.TRUSTED_ORIGINS.split(",").map(value => value.trim()).filter(Boolean)) {
    try { allowed.add(new URL(value).origin); } catch { /* invalid optional alias is ignored */ }
  }
  return allowed;
}

export function validMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const allowed = trustedOrigins();
  if (origin !== null) return allowed.has(origin);
  if (referer !== null) {
    try { return allowed.has(new URL(referer).origin); } catch { return false; }
  }
  // Non-browser API clients may omit both. Browsers must supply same-origin
  // Fetch Metadata; neither Host nor forwarded headers expand this allowlist.
  const site = request.headers.get("sec-fetch-site");
  const hasSessionCookie = /(?:^|;\s*)(?:alpha_terminal_session|__Host-alpha_terminal_session)=/.test(request.headers.get("cookie") ?? "");
  if (hasSessionCookie && site === null) return false;
  return site === null || site === "same-origin";
}

export function clientRateKey(request: Request) {
  // Set only behind a proxy that REPLACES this header, never one that appends
  // untrusted client-supplied values. Without it use a conservative shared key.
  const header = env.TRUSTED_CLIENT_IP_HEADER;
  const candidate = header ? request.headers.get(header)?.trim() : undefined;
  const ip = candidate && isIP(candidate) ? candidate : "shared";
  return createHash("sha256").update(ip).digest("hex");
}

export async function bodyWithinLimit(request: Request, limit = 32768) {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try { reader = request.clone().body?.getReader(); } catch { return false; }
  if (!reader) return true;
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Body read timeout")), 5000); });
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) return true;
      size += value.byteLength;
      if (size > limit) return false;
    }
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}
