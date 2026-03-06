import Dexie, { type EntityTable } from "dexie";

export interface Comic {
  id: number;
  title: string;
  pageCount: number;
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

export { db };
