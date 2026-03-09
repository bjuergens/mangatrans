import { Logger } from "./logger";
import {
  db,
  type RegionType,
  type TextDirection,
  type VocabEntry,
  type GrammarPoint,
} from "./db";

const API_BASE = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
const VISION_MODEL = "claude-sonnet-4-20250514";
const ANALYSIS_MODEL = "claude-sonnet-4-20250514";

/** Strip markdown code fences (```json ... ```) that Claude sometimes wraps around JSON. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```\w*\n([\s\S]*)\n```$/);
  return match ? match[1]! : trimmed;
}

/** Censor an API key for logging: show prefix and last 4 chars. */
function censorApiKey(key: string): string {
  if (key.length <= 10) return "***";
  return key.slice(0, 7) + "..." + key.slice(-4);
}

/** Truncate a string for debug logging. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `... (${s.length} chars total)`;
}

export interface ModelInfo {
  id: string;
  display_name: string;
  created_at: string;
  type: string;
}

export interface ApiKeyTestResult {
  valid: boolean;
  models: ModelInfo[];
  error?: string;
}

export interface ExtractedRegion {
  type: RegionType;
  text: string;
  bbox: [number, number, number, number];
}

export interface DetectedRegion {
  type: RegionType;
  bbox: [number, number, number, number];
  textDirection: TextDirection;
  hasFurigana: boolean;
}

export interface DetectRegionsResult {
  regions: DetectedRegion[];
  visualContext: string;
  rawResponse: string;
}

export interface OcrRegionResult {
  text: string;
  rawResponse: string;
}

export interface PageScanResult {
  regions: ExtractedRegion[];
  visualContext: string;
  rawResponse: string;
}

export interface TextAnalysisResult {
  vocabulary: VocabEntry[];
  grammar: GrammarPoint[];
  suggestedTranslation: string;
  rawResponse: string;
}

/** Convert a Blob to a base64 data string. */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read blob as base64"));
    reader.readAsDataURL(blob);
  });
}

function mediaType(
  blob: Blob,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const t = blob.type;
  if (t === "image/png") return "image/png";
  if (t === "image/gif") return "image/gif";
  if (t === "image/webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Crop a region from an image blob using Canvas.
 * bbox is [x, y, width, height] as fractions of image dimensions (0-1).
 */
export async function cropImage(
  imageBlob: Blob,
  bbox: [number, number, number, number],
): Promise<Blob> {
  const img = await createImageBitmap(imageBlob);
  const [fx, fy, fw, fh] = bbox;
  const sx = Math.round(fx * img.width);
  const sy = Math.round(fy * img.height);
  const sw = Math.round(fw * img.width);
  const sh = Math.round(fh * img.height);

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.convertToBlob({ type: "image/png" });
}

export class AnthropicClient {
  private log = new Logger("AnthropicClient");

  /** Read API key from DB. Throws if not configured. */
  private async getApiKey(): Promise<string> {
    const setting = await db.settings.get("apiKey");
    if (!setting?.value) {
      throw new Error("No API key configured. Go to Settings to add one.");
    }
    return setting.value;
  }

  /** Single point for all HTTP requests to the Anthropic API. */
  private async request(
    method: string,
    endpoint: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const apiKey = await this.getApiKey();
    const url = `${API_BASE}${endpoint}`;

    this.log.info(`🌐 ${method} ${endpoint}`);
    this.log.debug(
      `📤 Request ${method} ${endpoint} key=${censorApiKey(apiKey)} body=${body ? truncate(JSON.stringify(body), 2000) : "none"}`,
    );

    const response = await fetch(url, {
      method,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.log.error(`❌ ${method} ${endpoint} → ${response.status}`);
      this.log.debug(`📥 Error response: ${truncate(errorText, 2000)}`);

      // Parse Anthropic error format
      let message = `HTTP ${response.status} — ${errorText}`;
      try {
        const json = JSON.parse(errorText) as {
          error?: { message?: string };
        };
        if (json.error?.message) {
          message = json.error.message;
        }
      } catch {
        // not JSON, use raw text
      }
      throw new Error(`${endpoint}: ${message}`);
    }

    const json: unknown = await response.json();
    this.log.info(`✅ ${method} ${endpoint} → ${response.status}`);
    this.log.debug(`📥 Response: ${truncate(JSON.stringify(json), 2000)}`);

    return { status: response.status, body: json };
  }

  /** Validate an API key by calling GET /v1/models. No tokens consumed. */
  async testApiKey(): Promise<ApiKeyTestResult> {
    try {
      const { body } = await this.request("GET", "/models");
      const data = body as { data: ModelInfo[] };
      return { valid: true, models: data.data };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { valid: false, models: [], error };
    }
  }

  /** Send a manga page image to Claude Vision to extract text regions. */
  async scanPage(imageBlob: Blob): Promise<PageScanResult> {
    const base64 = await blobToBase64(imageBlob);
    const mimeType = mediaType(imageBlob);

    const body = {
      model: VISION_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
            {
              type: "text",
              text: `You are analyzing a manga page to help a Japanese language learner. Do two things:

1. **Extract all text regions** (speech bubbles, narration boxes, sound effects) from this manga page.
2. **Provide visual page context** — a brief description of what's happening on this page (characters, actions, setting, mood) that will help with translation later.

Respond ONLY with valid JSON in this exact format:
{
  "regions": [
    {
      "type": "dialogue" | "narration" | "sfx",
      "text": "the Japanese text exactly as written",
      "bbox": [x, y, width, height]
    }
  ],
  "visualContext": "Brief description of the page's visual content and context"
}

For bbox coordinates, use FRACTIONS of the page dimensions (0 to 1):
- x: left edge as fraction of page width
- y: top edge as fraction of page height
- width: region width as fraction of page width
- height: region height as fraction of page height

Important:
- Extract ALL visible Japanese text, including small text and sound effects
- Preserve the original text exactly (including kanji, hiragana, katakana)
- Classify each region: "dialogue" for speech bubbles, "narration" for narration boxes/captions, "sfx" for sound effects
- Order regions roughly by reading order (right-to-left, top-to-bottom for manga)
- Be precise with bounding boxes — they should tightly enclose only the text`,
            },
          ],
        },
      ],
    };

    const { body: responseBody } = await this.request(
      "POST",
      "/messages",
      body,
    );

    const json = responseBody as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = json.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("Claude returned no text content in scan response");
    }

    const rawResponse = textBlock.text;
    let parsed: { regions: ExtractedRegion[]; visualContext: string };
    try {
      parsed = JSON.parse(stripCodeFences(rawResponse));
    } catch (e) {
      throw new Error(
        `Failed to parse scan response as JSON: ${e instanceof Error ? e.message : e}\n\nRaw response (first 500 chars):\n${rawResponse.slice(0, 500)}`,
      );
    }

    this.log.info(
      `🔍 Page scan complete: ${parsed.regions.length} text regions found`,
    );
    return {
      regions: parsed.regions,
      visualContext: parsed.visualContext,
      rawResponse,
    };
  }

  /** Stage 1: Detect text region bounding boxes (no OCR). */
  async detectRegions(imageBlob: Blob): Promise<DetectRegionsResult> {
    const base64 = await blobToBase64(imageBlob);
    const mimeType = mediaType(imageBlob);

    const body = {
      model: VISION_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
            {
              type: "text",
              text: `You are analyzing a manga page to detect text regions. Do NOT read or transcribe the text — only locate where text appears.

1. **Detect all text regions** (speech bubbles, narration boxes, sound effects) and return their bounding boxes.
2. **Provide visual page context** — a brief description of what's happening on this page.

Respond ONLY with valid JSON in this exact format:
{
  "regions": [
    {
      "type": "dialogue" | "narration" | "sfx",
      "bbox": [x, y, size, size],
      "textDirection": "rtl" | "ltr" | "ttb",
      "hasFurigana": true | false
    }
  ],
  "visualContext": "Brief description of the page's visual content and context"
}

For bbox coordinates, use FRACTIONS of the page dimensions (0 to 1):
- x: left edge as fraction of page width
- y: top edge as fraction of page height
- size: the box is square — use the same value for width and height, sized to enclose the text region

For textDirection:
- "ttb": vertical Japanese text (top-to-bottom, right-to-left columns) — most common in manga
- "rtl": horizontal right-to-left text
- "ltr": horizontal left-to-right text (e.g. English loanwords, numbers)

Important:
- Detect ALL visible text regions, including small text and sound effects
- Classify each region: "dialogue" for speech bubbles, "narration" for narration boxes/captions, "sfx" for sound effects
- Order regions roughly by reading order (right-to-left, top-to-bottom for manga)
- Make bounding boxes square and tightly enclose the text
- Set hasFurigana to true if you see small reading aids (furigana/ruby text) next to kanji`,
            },
          ],
        },
      ],
    };

    const { body: responseBody } = await this.request(
      "POST",
      "/messages",
      body,
    );

    const json = responseBody as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = json.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("Claude returned no text content in detection response");
    }

    const rawResponse = textBlock.text;
    let parsed: { regions: DetectedRegion[]; visualContext: string };
    try {
      parsed = JSON.parse(stripCodeFences(rawResponse));
    } catch (e) {
      throw new Error(
        `Failed to parse detection response as JSON: ${e instanceof Error ? e.message : e}\n\nRaw response (first 500 chars):\n${rawResponse.slice(0, 500)}`,
      );
    }

    this.log.info(
      `🔍 Region detection complete: ${parsed.regions.length} regions found`,
    );
    return {
      regions: parsed.regions,
      visualContext: parsed.visualContext,
      rawResponse,
    };
  }

  /** Stage 2: OCR a single cropped text region. */
  async ocrRegion(croppedBlob: Blob): Promise<OcrRegionResult> {
    const base64 = await blobToBase64(croppedBlob);
    const mimeType = mediaType(croppedBlob);

    const body = {
      model: VISION_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64 },
            },
            {
              type: "text",
              text: `This is a cropped region from a manga page containing Japanese text. Read and transcribe the text exactly as written.

Respond ONLY with valid JSON:
{
  "text": "the Japanese text exactly as written"
}

Important:
- Preserve the original text exactly (including kanji, hiragana, katakana)
- Include all text visible in this crop
- If there are furigana (small reading aids), include only the main text, not the furigana`,
            },
          ],
        },
      ],
    };

    const { body: responseBody } = await this.request(
      "POST",
      "/messages",
      body,
    );

    const json = responseBody as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = json.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("Claude returned no text content in OCR response");
    }

    const rawResponse = textBlock.text;
    let parsed: { text: string };
    try {
      parsed = JSON.parse(stripCodeFences(rawResponse));
    } catch (e) {
      throw new Error(
        `Failed to parse OCR response as JSON: ${e instanceof Error ? e.message : e}\n\nRaw response (first 500 chars):\n${rawResponse.slice(0, 500)}`,
      );
    }

    this.log.info(
      `🔍 OCR complete: "${parsed.text.slice(0, 30)}${parsed.text.length > 30 ? "..." : ""}"`,
    );
    return { text: parsed.text, rawResponse };
  }

  /** Analyze a text region for vocabulary, grammar, and translation. */
  async analyzeTextRegion(
    text: string,
    regionType: RegionType,
    visualContext: string,
  ): Promise<TextAnalysisResult> {
    const body = {
      model: ANALYSIS_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are helping a Japanese language learner (A1-A2 level) understand manga text.

**Page context:** ${visualContext}

**Text region type:** ${regionType}

**Japanese text to analyze:**
${text}

Provide a complete linguistic breakdown. Respond ONLY with valid JSON in this exact format:
{
  "vocabulary": [
    {
      "word": "the word as it appears in the text",
      "reading": "full reading in hiragana",
      "dictionaryForm": "dictionary/base form",
      "partOfSpeech": "noun/verb/adjective/particle/etc",
      "definition": "English definition relevant to this context"
    }
  ],
  "grammar": [
    {
      "pattern": "the grammar pattern (e.g. ～ている, ～のに)",
      "explanation": "What this pattern means and how it's used here"
    }
  ],
  "suggestedTranslation": "A natural English translation of the text"
}

Important:
- Break down EVERY word, including particles and auxiliary verbs
- For verbs and adjectives, show the conjugated form vs dictionary form
- Explain grammar patterns at A1-A2 level — assume the learner knows basic hiragana/katakana but needs help with most kanji and grammar
- The translation should be natural English, not word-for-word
- Consider the visual page context when interpreting ambiguous text`,
        },
      ],
    };

    const { body: responseBody } = await this.request(
      "POST",
      "/messages",
      body,
    );

    const json = responseBody as {
      content: Array<{ type: string; text?: string }>;
    };
    const textBlock = json.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("Claude returned no text content in analysis response");
    }

    const rawResponse = textBlock.text;
    let parsed: {
      vocabulary: VocabEntry[];
      grammar: GrammarPoint[];
      suggestedTranslation: string;
    };
    try {
      parsed = JSON.parse(stripCodeFences(rawResponse));
    } catch (e) {
      throw new Error(
        `Failed to parse analysis response as JSON: ${e instanceof Error ? e.message : e}\n\nRaw response (first 500 chars):\n${rawResponse.slice(0, 500)}`,
      );
    }

    this.log.info(`🔍 Analysis complete for: "${text.slice(0, 30)}..."`);
    return {
      vocabulary: parsed.vocabulary,
      grammar: parsed.grammar,
      suggestedTranslation: parsed.suggestedTranslation,
      rawResponse,
    };
  }
}

export const anthropic = new AnthropicClient();
