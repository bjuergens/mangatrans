import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";

beforeEach(async () => {
  // Clear all tables before each test
  await db.comics.clear();
  await db.pages.clear();
  await db.textRegions.clear();
  await db.analyses.clear();
  await db.settings.clear();
});

describe("db schema", () => {
  it("has all expected tables", () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual([
      "analyses",
      "comics",
      "pages",
      "settings",
      "textRegions",
    ]);
  });

  it("can add and retrieve a comic", async () => {
    const id = await db.comics.add({
      title: "Test Manga",
      pageCount: 10,
      importedAt: new Date("2025-01-01"),
    });
    const comic = await db.comics.get(id);
    expect(comic).toBeDefined();
    expect(comic!.title).toBe("Test Manga");
    expect(comic!.pageCount).toBe(10);
  });

  it("can store and retrieve settings by key", async () => {
    await db.settings.put({ key: "apiKey", value: "sk-test-123" });
    const setting = await db.settings.get("apiKey");
    expect(setting).toBeDefined();
    expect(setting!.value).toBe("sk-test-123");
  });
});
