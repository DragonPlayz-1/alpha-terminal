import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("landing page, registration, and authenticated workspace", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const assetFailures: string[] = [];
  page.on("response", response => { if (response.url().includes("/_next/static/") && response.status() >= 400) assetFailures.push(response.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /make sharper/i })).toBeVisible();
  await page.getByRole("link", { name: /open terminal/i }).first().click();
  await expect(page).toHaveURL(/\/register$/);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  await page.getByPlaceholder("market_maven").fill(`e2e_${suffix}`);
  await page.getByPlaceholder("you@example.com").fill(`e2e_${suffix}@example.com`);
  await page.getByLabel("Create password", { exact: true }).fill("browser-test-password");
  const [registrationResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/auth/register") && response.request().method() === "POST"),
    page.getByRole("button", { name: /create simulated account/i }).click(),
  ]);
  await expect(registrationResponse.status()).toBe(201);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /your command center/i })).toBeVisible();
  await page.locator("#mobile-navigation").getByRole("link", { name: "Terminal", exact: true }).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await expect(page.getByText("Trading terminal")).toBeVisible();
  await page.goto("/settings");
  const renamed = `updated_${suffix}`.slice(0, 24);
  await page.getByLabel("Username", { exact: true }).fill(renamed);
  await page.getByRole("checkbox", { name: /Public trading statistics/ }).check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(renamed);
  await expect(page.getByRole("checkbox", { name: /Public trading statistics/ })).toBeChecked();
  expect(errors).toEqual([]);
  expect(assetFailures).toEqual([]);
});

test("login recovers from a failed network request", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill("offline@example.test");
  await page.getByPlaceholder("Enter your password").fill("offline-test-password");
  await page.route("**/api/auth/login", route => route.abort("failed"));
  await page.getByRole("button", { name: "Enter terminal" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Connection interrupted" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter terminal" })).toBeEnabled();
});

test("valid login persists across navigation, reload, logout, and re-login", async ({ page, request }) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const credentials = { username: `login_${suffix}`.slice(0, 24), email: `login_${suffix}@example.com`, password: "browser-login-password", initialCapital: 10000 };
  const registered = await request.post("/api/auth/register", { data: credentials });
  expect(registered.status(), await registered.text()).toBe(201);

  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Enter terminal" }).click(),
  ]);
  expect(loginResponse.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /your command center/i })).toBeVisible();

  await page.goto("/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Portfolio" })).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Enter terminal" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
});
