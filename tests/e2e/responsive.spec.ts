import { test, expect } from "./fixtures";

test.describe("responsive public experience", () => {
  test.use({ viewport: { width: 320, height: 780 }, isMobile: true });

  test("landing navigation works at the narrowest supported width without overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.locator('header a[href="/register"]').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "Experience" })).toBeVisible();
    await page.getByRole("link", { name: "Experience" }).click();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#experience")).toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("auth form keeps controls usable on a narrow viewport", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter terminal" })).toBeVisible();
    await page.getByRole("button", { name: "Enter terminal" }).click();
    await expect(page.getByLabel("Email address", { exact: true })).toHaveAttribute("required", "");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("authenticated shell keeps primary screens within the viewport", async ({ page }) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await page.goto("/register");
    await page.getByPlaceholder("market_maven").fill(`mobile_${suffix}`.slice(0, 24));
    await page.getByPlaceholder("you@example.com").fill(`mobile_${suffix}@example.com`);
    await page.getByLabel("Create password", { exact: true }).fill("mobile-test-password");
    await page.getByRole("button", { name: /create simulated account/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    for (const path of ["/dashboard", "/markets", "/portfolio", "/orders", "/futures"]) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.locator("#mobile-navigation")).toBeVisible();
    await expect(page.locator("#mobile-navigation").getByRole("link", { name: "Futures" })).toBeVisible();
  });

  test("settings security and alert controls fit at mobile and desktop widths", async ({ page }) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await page.goto("/register");
    await page.getByPlaceholder("market_maven").fill(`controls_${suffix}`.slice(0, 24));
    await page.getByPlaceholder("you@example.com").fill(`controls_${suffix}@example.com`);
    await page.getByLabel("Create password", { exact: true }).fill("controls-test-password");
    await page.getByRole("button", { name: /create simulated account/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await page.goto("/settings");
    await expect(page.getByText("Active sessions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
    await expect(page.getByText("Price alerts", { exact: true })).toBeVisible();
    await page.getByLabel("Target price").fill("1");
    await page.getByRole("button", { name: "Add alert" }).click();
    await expect(page.getByText("BTC-USD", { exact: true }).last()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe("additional viewport smoke checks", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    test(`landing page fits at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /make sharper/i })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
