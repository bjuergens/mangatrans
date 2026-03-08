import Dexie, { type EntityTable } from "dexie";
import { assetUrl } from "./router";

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
  /** Visual context description from AI page scan */
  visualContext?: string;
  /** Whether text regions have been detected (boxes only, no OCR yet) */
  detected?: boolean;
  /** Whether this page has been scanned for text regions (OCR complete) */
  scanned?: boolean;
}

export type RegionType = "dialogue" | "narration" | "sfx";

export type TextDirection = "rtl" | "ltr" | "ttb";

export interface TextRegion {
  id: number;
  pageId: number;
  type: RegionType;
  /** Extracted Japanese text (empty after detection, filled after OCR) */
  text: string;
  /** Bounding box: [x, y, size, size] as fractions of page dimensions (0-1). Boxes are square. */
  bbox: [number, number, number, number];
  /** Text reading direction */
  textDirection?: TextDirection;
  /** Whether this region contains furigana */
  hasFurigana?: boolean;
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
  /** Suggested English translation */
  suggestedTranslation: string;
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

// v3: TextRegion gains textDirection, hasFurigana; Page gains detected flag
db.version(3).stores({
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

  const exampleDir = assetUrl("example/wikipe/");
  const pageBlobs = await Promise.all(
    EXAMPLE_MANGA_PAGES.map((name) => fetchImageAsBlob(`${exampleDir}${name}`)),
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
