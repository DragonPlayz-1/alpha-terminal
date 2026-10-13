import { test as base, expect } from "@playwright/test";
import { db } from "@/lib/db";

// Each test gets its own rate-limit budget; requests within a test still exercise
// production limits. Never clear application data or use this outside test.mjs.
export const test = base.extend<{ isolatedRateLimits: void }>({
  isolatedRateLimits: [async ({ baseURL }, use) => {
    const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema");
    if (!schema?.startsWith("alpha_test_") || schema !== process.env.TEST_SCHEMA || baseURL !== "http://127.0.0.1:3100") throw new Error("E2E fixtures require an isolated local test schema.");
    await db.rateLimit.deleteMany();
    await use();
  }, { auto: true }],
});
export { expect };
