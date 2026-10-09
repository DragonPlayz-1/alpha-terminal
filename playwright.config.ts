import { defineConfig, devices } from "@playwright/test";

if (!process.env.TEST_SCHEMA?.startsWith("alpha_test_")) throw new Error("Use npm run test:e2e to isolate the database.");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: { baseURL: "http://127.0.0.1:3100", extraHTTPHeaders: { Origin: "http://127.0.0.1:3100" }, trace: "retain-on-failure", headless: true },
  webServer: { command: "npm run start", url: "http://127.0.0.1:3100/api/health", reuseExistingServer: false, timeout: 120_000, env: { NODE_ENV: "production", PORT: "3100", HOSTNAME: "127.0.0.1" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
