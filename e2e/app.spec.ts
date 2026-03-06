import { test, expect } from "@playwright/test";

test("app loads with title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("MangaTrans");
});

test("library page shows import prompt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your manga library")).toBeVisible();
});

test("can navigate to settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Anthropic API Key")).toBeVisible();
});

test("can navigate back to library from settings", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page.getByText("Your manga library")).toBeVisible();
});
