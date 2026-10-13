import { test, expect } from "./fixtures";

test("authenticated product surfaces support journal, analytics, preferences, and quick commands", async ({ page }) => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  await page.goto("/register");
  await page.getByPlaceholder("market_maven").fill(`features_${suffix}`.slice(0, 24));
  await page.getByPlaceholder("you@example.com").fill(`features_${suffix}@example.com`);
  await page.getByLabel("Create password", { exact: true }).fill("features-test-password");
  await page.getByRole("button", { name: /create simulated account/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByLabel("Trading account scope")).toHaveValue("main");

  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Trade journal" })).toBeVisible();
  await page.locator("#journal-notes").fill("Recorded the setup and waited for confirmation.");
  await page.getByRole("button", { name: "Save journal entry" }).click();
  await expect(page.getByRole("status")).toContainText("Journal entry saved");
  await expect(page.getByText("Recorded the setup and waited for confirmation.")).toBeVisible();

  await page.goto("/portfolio");
  await expect(page.getByText("Performance analytics", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "7D" })).toBeVisible();
  await page.getByRole("button", { name: "7D" }).click();
  await expect(page.getByText("Max drawdown", { exact: true })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText("Notification preferences", { exact: true })).toBeVisible();
  const fills = page.getByLabel("Order fills");
  await fills.uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("Notification preferences saved");

  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Quick command palette" })).toBeVisible();
  await page.getByLabel("Search commands and markets").fill("journal");
  await page.getByRole("button", { name: /open trade journal/i }).click();
  await expect(page).toHaveURL(/\/journal$/);
});
