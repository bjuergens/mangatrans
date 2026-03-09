import { Logger } from "./logger";
import { db } from "./db";
import { blobToDataUri, getImageDimensions } from "./image-utils";

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

/** Censor an API key for logging: show first 4 and last 4 chars. */
function censorApiKey(key: string): string {
  if (key.length <= 10) return "***";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/** Truncate a string for debug logging. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `... (${s.length} chars total)`;
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

const API_ENDPOINT = "https://api.ocr.space/parse/image";

export class OcrSpaceClient {
  private log = new Logger("OcrSpaceClient");

  /** Read API key from DB. Throws if not configured. */
  private async getApiKey(): Promise<string> {
    const setting = await db.settings.get("ocrSpaceApiKey");
    if (!setting?.value) {
      throw new Error(
        "No OCR.space API key configured. Go to Settings to add one.",
      );
    }
    return setting.value;
  }

  /** Read OCR.space-specific settings from DB with defaults. */
  private async getSettings(): Promise<OcrSpaceSettings> {
    const [engineSetting, languageSetting] = await Promise.all([
      db.settings.get("ocrSpaceEngine"),
      db.settings.get("ocrSpaceLanguage"),
    ]);
    return {
      engine: (engineSetting?.value as "1" | "2") || "2",
      language: languageSetting?.value || "jpn",
    };
  }

  /** Single point for all HTTP requests to the OCR.space API. */
  private async request(
    formData: FormData,
    apiKey: string,
  ): Promise<OcrApiResponse> {
    this.log.info(`🌐 POST ${API_ENDPOINT}`);
    this.log.debug(
      `📤 Request POST ${API_ENDPOINT} key=${censorApiKey(apiKey)}`,
    );

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { apikey: apiKey },
      body: formData,
    });

    if (!response.ok) {
      this.log.error(`❌ POST ${API_ENDPOINT} → ${response.status}`);
      throw new Error(
        `OCR.space API error: ${response.status} ${response.statusText}`,
      );
    }

    const data: OcrApiResponse = await response.json();
    this.log.info(`✅ POST ${API_ENDPOINT} → exit code ${data.OCRExitCode}`);
    this.log.debug(`📥 Response: ${truncate(JSON.stringify(data), 2000)}`);

    return data;
  }

  /** Send a full manga page image to OCR.space for text detection + OCR. */
  async ocrPage(imageBlob: Blob): Promise<OcrSpacePageResult> {
    const apiKey = await this.getApiKey();
    const settings = await this.getSettings();
    const dataUri = await blobToDataUri(imageBlob);
    const { width: imgWidth, height: imgHeight } =
      await getImageDimensions(imageBlob);

    this.log.info(
      `🔍 Scanning page (${imgWidth}x${imgHeight}) engine=${settings.engine} lang=${settings.language}`,
    );

    const formData = new FormData();
    formData.append("base64Image", dataUri);
    formData.append("language", settings.language);
    formData.append("OCREngine", settings.engine);
    formData.append("isOverlayRequired", "true");
    formData.append("scale", "true");

    const data = await this.request(formData, apiKey);
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

    this.log.info(`🔍 OCR.space: found ${regions.length} text regions`);
    return { regions, rawResponse };
  }

  /** Validate the saved API key by sending a minimal test image. */
  async testApiKey(): Promise<OcrSpaceTestResult> {
    try {
      const apiKey = await this.getApiKey();

      // Send a minimal 1x1 white PNG to validate the key
      const minimalPng =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

      const formData = new FormData();
      formData.append("base64Image", minimalPng);
      formData.append("language", "eng");

      const data = await this.request(formData, apiKey);

      // A valid key will process the image (even if no text found)
      if (data.OCRExitCode === 1 || data.OCRExitCode === 2) {
        return { valid: true };
      }

      return {
        valid: false,
        error:
          data.ErrorMessage?.join("; ") ||
          "Invalid API key or processing error",
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export const ocrSpace = new OcrSpaceClient();
