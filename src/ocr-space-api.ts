import { Logger } from "./logger";
import { db } from "./db";
import { blobToDataUri, getImageDimensions } from "./image-utils";

const log = new Logger("OcrSpaceApi");

const API_ENDPOINT = "https://api.ocr.space/parse/image";

export interface OcrSpaceSettings {
  engine: "1" | "2";
  language: string;
}

export interface OcrSpaceRegion {
  text: string;
  bbox: [number, number, number, number]; // [x, y, w, h] as fractions 0–1
}

export interface OcrSpacePageResult {
  regions: OcrSpaceRegion[];
  rawResponse: string;
}

export interface OcrSpaceTestResult {
  valid: boolean;
  error?: string;
}

// OCR.space API response types
interface OcrWord {
  WordText: string;
  Left: number;
  Top: number;
  Height: number;
  Width: number;
}

interface OcrLine {
  LineText: string;
  Words: OcrWord[];
  MaxHeight: number;
  MinTop: number;
}

interface OcrTextOverlay {
  Lines: OcrLine[];
  HasOverlay: boolean;
}

interface OcrParsedResult {
  TextOverlay: OcrTextOverlay;
  ParsedText: string;
  ErrorMessage: string;
  ErrorDetails: string;
}

interface OcrApiResponse {
  ParsedResults: OcrParsedResult[];
  OCRExitCode: number;
  IsErroredOnProcessing: boolean;
  ErrorMessage: string[];
  ErrorDetails: string;
}

async function getApiKey(): Promise<string> {
  const setting = await db.settings.get("ocrSpaceApiKey");
  if (!setting?.value) {
    throw new Error(
      "No OCR.space API key configured. Go to Settings to add one.",
    );
  }
  return setting.value;
}

async function getSettings(): Promise<OcrSpaceSettings> {
  const [engineSetting, languageSetting] = await Promise.all([
    db.settings.get("ocrSpaceEngine"),
    db.settings.get("ocrSpaceLanguage"),
  ]);
  return {
    engine: (engineSetting?.value as "1" | "2") || "2",
    language: languageSetting?.value || "jpn",
  };
}

/** Compute bounding box for a line from its words, as fractions of page dimensions. */
function lineBbox(
  words: OcrWord[],
  pageWidth: number,
  pageHeight: number,
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of words) {
    minX = Math.min(minX, w.Left);
    minY = Math.min(minY, w.Top);
    maxX = Math.max(maxX, w.Left + w.Width);
    maxY = Math.max(maxY, w.Top + w.Height);
  }
  return [
    minX / pageWidth,
    minY / pageHeight,
    (maxX - minX) / pageWidth,
    (maxY - minY) / pageHeight,
  ];
}

export async function ocrPage(imageBlob: Blob): Promise<OcrSpacePageResult> {
  const apiKey = await getApiKey();
  const settings = await getSettings();
  const dataUri = await blobToDataUri(imageBlob);
  const { width: imgWidth, height: imgHeight } =
    await getImageDimensions(imageBlob);

  log.info(
    `🌐 OCR.space: sending page (${imgWidth}x${imgHeight}) engine=${settings.engine} lang=${settings.language}`,
  );

  const formData = new FormData();
  formData.append("base64Image", dataUri);
  formData.append("language", settings.language);
  formData.append("OCREngine", settings.engine);
  formData.append("isOverlayRequired", "true");
  formData.append("scale", "true");

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { apikey: apiKey },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `OCR.space API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: OcrApiResponse = await response.json();
  const rawResponse = JSON.stringify(data);

  if (data.IsErroredOnProcessing || data.OCRExitCode !== 1) {
    const errorMsg =
      data.ErrorMessage?.join("; ") ||
      data.ParsedResults?.[0]?.ErrorMessage ||
      "Unknown OCR.space error";
    throw new Error(`OCR.space processing error: ${errorMsg}`);
  }

  const parsed = data.ParsedResults?.[0];
  if (!parsed) {
    throw new Error("OCR.space returned no results");
  }

  const lines = parsed.TextOverlay?.Lines ?? [];
  const regions: OcrSpaceRegion[] = [];

  for (const line of lines) {
    if (!line.Words || line.Words.length === 0) continue;
    const text = line.LineText.trim();
    if (!text) continue;

    const bbox = lineBbox(line.Words, imgWidth, imgHeight);
    regions.push({ text, bbox });
  }

  log.info(`🔍 OCR.space: found ${regions.length} text regions`);
  return { regions, rawResponse };
}

export async function testApiKey(apiKey: string): Promise<OcrSpaceTestResult> {
  try {
    // Send a minimal 1x1 white PNG to validate the key
    const minimalPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

    const formData = new FormData();
    formData.append("base64Image", minimalPng);
    formData.append("language", "eng");

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { apikey: apiKey },
      body: formData,
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data: OcrApiResponse = await response.json();

    // A valid key will process the image (even if no text found)
    if (data.OCRExitCode === 1 || data.OCRExitCode === 2) {
      return { valid: true };
    }

    return {
      valid: false,
      error:
        data.ErrorMessage?.join("; ") || "Invalid API key or processing error",
    };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
