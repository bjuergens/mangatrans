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

  it("can add and retrieve a comic with coverImage", async () => {
    const coverBlob = new Blob(["fake-image"], { type: "image/jpeg" });
    const id = await db.comics.add({
      title: "Test Manga",
      pageCount: 10,
      coverImage: coverBlob,
      importedAt: new Date("2025-01-01"),
    });
    const comic = await db.comics.get(id);
    expect(comic).toBeDefined();
    expect(comic!.title).toBe("Test Manga");
    expect(comic!.pageCount).toBe(10);
    expect(comic!.coverImage).toBeTruthy();
  });

  it("can store and retrieve pages for a comic", async () => {
    const coverBlob = new Blob(["cover"], { type: "image/jpeg" });
    const comicId = await db.comics.add({
      title: "Page Test",
      pageCount: 2,
      coverImage: coverBlob,
      importedAt: new Date(),
    });

    await db.pages.bulkAdd([
      {
        comicId,
        pageNumber: 1,
        imageBlob: new Blob(["page1"], { type: "image/jpeg" }),
      },
      {
        comicId,
        pageNumber: 2,
        imageBlob: new Blob(["page2"], { type: "image/jpeg" }),
      },
    ]);

    const pages = await db.pages.where({ comicId }).toArray();
    expect(pages).toHaveLength(2);
    expect(pages[0]!.imageBlob).toBeTruthy();
  });

  it("can query a page by comicId and pageNumber", async () => {
    const coverBlob = new Blob(["cover"], { type: "image/jpeg" });
    const comicId = await db.comics.add({
      title: "Query Test",
      pageCount: 1,
      coverImage: coverBlob,
      importedAt: new Date(),
    });

    await db.pages.add({
      comicId,
      pageNumber: 1,
      imageBlob: new Blob(["page-data"], { type: "image/jpeg" }),
    });

    const page = await db.pages.where({ comicId, pageNumber: 1 }).first();
    expect(page).toBeDefined();
    expect(page!.pageNumber).toBe(1);
  });

  it("can store and retrieve settings by key", async () => {
    await db.settings.put({ key: "apiKey", value: "sk-test-123" });
    const setting = await db.settings.get("apiKey");
    expect(setting).toBeDefined();
    expect(setting!.value).toBe("sk-test-123");
  });
});
