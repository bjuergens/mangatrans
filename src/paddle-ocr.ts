import { Logger } from "./logger";
import { db } from "./db";
import type { OcrRegionResult } from "./claude-api";

const DEFAULT_SERVER_URL = "http://localhost:8866";

const log = new Logger("PaddleOCR");

/** Convert a Blob to a base64 string (without data URL prefix). */
async function blobToBase64(blob: Blob): Promise<string> {
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

/** Read the PaddleOCR server URL from settings, falling back to default. */
async function getServerUrl(): Promise<string> {
  const setting = await db.settings.get("paddleOcrUrl");
  return setting?.value || DEFAULT_SERVER_URL;
}

/**
 * Send a cropped image to a PaddleOCR server for text recognition.
 *
 * Expected server API (PaddleHub Serving / PaddleOCR HTTP):
 *   POST /predict/ocr_system
 *   Body: { "images": ["<base64>"] }
 *   Response: { "results": [{ "data": [{ "text": "...", "confidence": 0.9 }] }] }
 *
 * The recognized text lines are concatenated and returned.
 */
export async function paddleOcrRegion(
  croppedBlob: Blob,
): Promise<OcrRegionResult> {
  const serverUrl = await getServerUrl();
  const base64 = await blobToBase64(croppedBlob);

  const url = `${serverUrl}/predict/ocr_system`;
  log.info(`🌐 POST ${url}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images: [base64] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`❌ PaddleOCR ${response.status}: ${errorText}`);
    throw new Error(
      `PaddleOCR server error (${response.status}): ${errorText.slice(0, 200)}`,
    );
  }

  const json = (await response.json()) as {
    results: Array<{
      data?: Array<{ text: string; confidence: number }>;
    }>;
  };

  const items = json.results?.[0]?.data ?? [];
  const text = items.map((item) => item.text).join("");

  log.info(
    `🔍 PaddleOCR complete: "${text.slice(0, 30)}${text.length > 30 ? "..." : ""}"`,
  );

  return { text, rawResponse: JSON.stringify(json) };
}
