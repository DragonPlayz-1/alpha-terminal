import { describe, expect, it } from "vitest";
import { appOrigin, bodyWithinLimit, clientRateKey, validMutationOrigin } from "@/server/security/request";

describe("request security boundaries", () => {
  it("allows the configured local origin and rejects an external origin", () => {
    expect(validMutationOrigin(new Request(`${appOrigin()}/api/orders`, { method: "POST", headers: { origin: appOrigin() } }))).toBe(true);
    expect(validMutationOrigin(new Request("http://localhost:3000/api/orders", { method: "POST", headers: { origin: "https://evil.example" } }))).toBe(false);
  });

  it("rejects cookie mutations with no trusted context and ignores forged host headers", () => {
    expect(validMutationOrigin(new Request(`${appOrigin()}/api/orders`, { method: "POST", headers: { cookie: "__Host-alpha_terminal_session=test" } }))).toBe(false);
    expect(validMutationOrigin(new Request(`${appOrigin()}/api/orders`, { method: "POST", headers: { origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "evil.example" } }))).toBe(false);
    expect(validMutationOrigin(new Request(`${appOrigin()}/api/orders`, { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).toBe(false);
    expect(validMutationOrigin(new Request(`${appOrigin()}/api/orders`, { method: "POST", headers: { referer: `${appOrigin()}/terminal`, cookie: "__Host-alpha_terminal_session=test" } }))).toBe(true);
  });

  it("bounds both declared and streamed request bodies", async () => {
    expect(await bodyWithinLimit(new Request("http://localhost/api", { method: "POST", body: "small" }), 32)).toBe(true);
    expect(await bodyWithinLimit(new Request("http://localhost/api", { method: "POST", body: "0123456789".repeat(4) }), 32)).toBe(false);
  });

  it("does not use an untrusted forwarded address as a rate-limit identity", () => {
    const first = new Request("http://localhost/api", { headers: { "x-forwarded-for": "203.0.113.1" } });
    const second = new Request("http://localhost/api", { headers: { "x-forwarded-for": "203.0.113.2" } });
    expect(clientRateKey(first)).toBe(clientRateKey(second));
  });
});
