import Dexie, { type EntityTable } from "dexie";

export interface Comic {
  id: number;
  title: string;
  pageCount: number;
  coverImage: Blob;
  importedAt: Date;
}

export interface Page {
  id: number;
  comicId: number;
  pageNumber: number;
  /** Manga page image stored as a Blob */
  imageBlob: Blob;
}

export type RegionType = "dialogue" | "narration" | "sfx";

export interface TextRegion {
  id: number;
  pageId: number;
  type: RegionType;
  /** Extracted Japanese text */
  text: string;
  /** Bounding box: [x, y, width, height] as fractions of page dimensions (0-1) */
  bbox: [number, number, number, number];
}

export interface VocabEntry {
  word: string;
  reading: string;
  dictionaryForm: string;
  partOfSpeech: string;
  definition: string;
}

export interface GrammarPoint {
  pattern: string;
  explanation: string;
}

export interface Analysis {
  id: number;
  textRegionId: number;
  vocabulary: VocabEntry[];
  grammar: GrammarPoint[];
  /** Raw JSON response from AI for debugging */
  rawResponse: string;
}

export interface Setting {
  key: string;
  value: string;
}

const db = new Dexie("MangaTransDB") as Dexie & {
  comics: EntityTable<Comic, "id">;
  pages: EntityTable<Page, "id">;
  textRegions: EntityTable<TextRegion, "id">;
  analyses: EntityTable<Analysis, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  comics: "++id, title, importedAt",
  pages: "++id, comicId, pageNumber",
  textRegions: "++id, pageId, type",
  analyses: "++id, textRegionId",
  settings: "key",
});

// v2: adds coverImage to comics, compound index on pages for [comicId+pageNumber] queries
db.version(2).stores({
  comics: "++id, title, importedAt",
  pages: "++id, comicId, [comicId+pageNumber]",
  textRegions: "++id, pageId, type",
  analyses: "++id, textRegionId",
  settings: "key",
});

const EXAMPLE_MANGA_PAGES = [
  "Wikipe-tan_manga_page1.jpg",
  "Wikipe-tan_manga_page2.jpg",
  "Wikipe-tan_manga_page3.jpg",
  "Wikipe-tan_manga_page4.jpg",
];

async function fetchImageAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.blob();
}

/** Seeds the example Wikipe-tan manga into the library if no comics exist yet. */
export async function seedExampleManga(): Promise<void> {
  const count = await db.comics.count();
  if (count > 0) return;

  const baseUrl = `${import.meta.env.BASE_URL}example/wikipe/`;
  const pageBlobs = await Promise.all(
    EXAMPLE_MANGA_PAGES.map((name) => fetchImageAsBlob(`${baseUrl}${name}`)),
  );

  const comicId = await db.comics.add({
    title: "Wikipe-tan",
    pageCount: EXAMPLE_MANGA_PAGES.length,
    coverImage: pageBlobs[0]!,
    importedAt: new Date(),
  });

  await db.pages.bulkAdd(
    pageBlobs.map((blob, i) => ({
      comicId,
      pageNumber: i + 1,
      imageBlob: blob,
    })),
  );
}

export { db };
