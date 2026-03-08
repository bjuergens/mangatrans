import { Logger } from "./logger";
import type { RegionType, VocabEntry, GrammarPoint } from "./db";

const log = new Logger("ClaudeAPI");

const API_BASE = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";
const VISION_MODEL = "claude-sonnet-4-20250514";
const ANALYSIS_MODEL = "claude-sonnet-4-20250514";

function apiHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
    "content-type": "application/json",
  };
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

/** Validate an API key by calling GET /v1/models. No tokens consumed. */
export async function testApiKey(apiKey: string): Promise<ApiKeyTestResult> {
  log.info("🔍 Testing API key...");
  const response = await fetch(`${API_BASE}/models`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    log.error(`❌ API key test failed: ${response.status} ${body}`);
    return {
      valid: false,
      models: [],
      error: `HTTP ${response.status}: ${body}`,
    };
  }

  const json = (await response.json()) as { data: ModelInfo[] };
  log.info(`✅ API key valid. ${json.data.length} models available.`);
  return { valid: true, models: json.data };
}

export interface ExtractedRegion {
  type: RegionType;
  text: string;
  bbox: [number, number, number, number];
}

export interface PageScanResult {
  regions: ExtractedRegion[];
  visualContext: string;
  rawResponse: string;
}

/** Convert a Blob to a base64 data string for the Claude vision API. */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Strip the "data:...;base64," prefix
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

/** Send a manga page image to Claude Vision to extract text regions. */
export async function scanPage(
  apiKey: string,
  imageBlob: Blob,
): Promise<PageScanResult> {
  log.info("🔍 Scanning page for text regions...");

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

  const response = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Claude API scan failed: HTTP ${response.status} — ${errorBody}`,
    );
  }

  const json = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = json.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude API returned no text content in scan response");
  }

  const rawResponse = textBlock.text;
  const parsed = JSON.parse(rawResponse) as {
    regions: ExtractedRegion[];
    visualContext: string;
  };

  log.info(
    `✅ Page scan complete: ${parsed.regions.length} text regions found`,
  );
  return {
    regions: parsed.regions,
    visualContext: parsed.visualContext,
    rawResponse,
  };
}

export interface TextAnalysisResult {
  vocabulary: VocabEntry[];
  grammar: GrammarPoint[];
  suggestedTranslation: string;
  rawResponse: string;
}

/** Analyze a text region for vocabulary, grammar, and translation. */
export async function analyzeTextRegion(
  apiKey: string,
  text: string,
  regionType: RegionType,
  visualContext: string,
): Promise<TextAnalysisResult> {
  log.info(`🔍 Analyzing text region: "${text.slice(0, 30)}..."`);

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

  const response = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: apiHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Claude API analysis failed: HTTP ${response.status} — ${errorBody}`,
    );
  }

  const json = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = json.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude API returned no text content in analysis response");
  }

  const rawResponse = textBlock.text;
  const parsed = JSON.parse(rawResponse) as {
    vocabulary: VocabEntry[];
    grammar: GrammarPoint[];
    suggestedTranslation: string;
  };

  log.info(`✅ Analysis complete for: "${text.slice(0, 30)}..."`);
  return {
    vocabulary: parsed.vocabulary,
    grammar: parsed.grammar,
    suggestedTranslation: parsed.suggestedTranslation,
    rawResponse,
  };
}
