import { test } from "./fixtures";
import { expect } from "@playwright/test";

test("app loads with title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("MangaTrans");
});

test("library page shows example manga after seeding", async ({ page }) => {
  await page.goto("/");
  // Wait for the comic grid to appear (seeding fetches images)
  await expect(page.getByTestId("comic-grid")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Wikipe-tan")).toBeVisible();
});

test("library page shows upload area", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Drop a CBZ file here or click to browse"),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("upload-button")).toBeVisible();
});

test("can navigate to settings", async ({ page }) => {
  await page.goto("/");
  await page.locator("nav").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Anthropic API Key")).toBeVisible();
});

test("can navigate back to library from settings", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Library" }).click();
  // Wait for the grid to appear (seeding happens on library load)
  await expect(page.getByTestId("comic-grid")).toBeVisible({ timeout: 10000 });
});

test("can navigate to settings via gear icon on library page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("settings-link").click();
  await expect(page.getByText("Anthropic API Key")).toBeVisible();
});

test("clicking a comic opens the reader", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("comic-grid")).toBeVisible({ timeout: 10000 });

  // Click on the Wikipe-tan comic card
  await page.getByText("Wikipe-tan").click();

  // Should navigate to reader and show the page image
  await expect(page.getByTestId("reader-title")).toHaveText("Wikipe-tan");
  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 4");
  await expect(page.getByTestId("page-image")).toBeVisible({ timeout: 10000 });
});

test("reader page navigation works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("comic-grid")).toBeVisible({ timeout: 10000 });
  await page.getByText("Wikipe-tan").click();

  await expect(page.getByTestId("page-indicator")).toHaveText("1 / 4");

  // Previous should be disabled on page 1
  await expect(page.getByTestId("prev-page")).toBeDisabled();

  // Go to page 2
  await page.getByTestId("next-page").click();
  await expect(page.getByTestId("page-indicator")).toHaveText("2 / 4");
  await expect(page.getByTestId("prev-page")).toBeEnabled();
});

test("reader back to library link works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("comic-grid")).toBeVisible({ timeout: 10000 });
  await page.getByText("Wikipe-tan").click();

  await expect(page.getByTestId("reader-title")).toBeVisible();
  await page.getByTestId("back-to-library").click();
  await expect(page.getByTestId("comic-grid")).toBeVisible({ timeout: 10000 });
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
  await expect(page.getByText("PaddleOCR", { exact: true })).toBeVisible();
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
