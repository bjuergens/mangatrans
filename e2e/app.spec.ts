import { test } from "./fixtures";
import { expect } from "@playwright/test";

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
  await page.locator("nav").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Anthropic API Key")).toBeVisible();
});

test("can navigate back to library from settings", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page.getByText("Your manga library")).toBeVisible();
});

test("can navigate to settings via gear icon on library page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("settings-link").click();
  await expect(page.getByText("Anthropic API Key")).toBeVisible();
});

test("can save and persist API key", async ({ page }) => {
  await page.goto("/settings");
  const input = page.getByTestId("api-key-input");
  await input.fill("sk-ant-test-key-123");
  await page.getByTestId("save-api-key").click();
  await expect(page.getByText("API key saved")).toBeVisible();

  // Reload and verify persistence
  await page.reload();
  await expect(page.getByText("API key saved")).toBeVisible();
});

test("can clear API key", async ({ page }) => {
  await page.goto("/settings");
  const input = page.getByTestId("api-key-input");
  await input.fill("sk-ant-test-key-to-clear");
  await page.getByTestId("save-api-key").click();
  await expect(page.getByText("API key saved")).toBeVisible();

  await page.getByTestId("clear-api-key").click();
  await expect(page.getByText("API key saved")).not.toBeVisible();
});

test("settings page shows text extraction options", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("Text Extraction")).toBeVisible();
  await expect(page.getByText("AI Vision")).toBeVisible();
  await expect(page.getByText("Local OCR")).toBeVisible();
});

test("settings page shows analysis detail options", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("Analysis Detail")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Basic/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Detailed/ })).toBeVisible();
});

test("settings page shows build timestamp", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText(/Build:/)).toBeVisible();
});
