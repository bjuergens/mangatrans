import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ocrPage, testApiKey } from "./ocr-space-api";
import { db } from "./db";

const mockFetch = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
  await db.settings.put({ key: "ocrSpaceApiKey", value: "test-ocr-key" });
  await db.settings.put({ key: "ocrSpaceEngine", value: "2" });
  await db.settings.put({ key: "ocrSpaceLanguage", value: "jpn" });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.settings.clear();
});

function makeOcrResponse(
  lines: Array<{
    text: string;
    words: Array<{
      text: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }>;
  }>,
) {
  return {
    ParsedResults: [
      {
        TextOverlay: {
          Lines: lines.map((line) => ({
            LineText: line.text,
            Words: line.words.map((w) => ({
              WordText: w.text,
              Left: w.left,
              Top: w.top,
              Width: w.width,
              Height: w.height,
            })),
            MaxHeight: Math.max(...line.words.map((w) => w.height)),
            MinTop: Math.min(...line.words.map((w) => w.top)),
          })),
          HasOverlay: true,
        },
        ParsedText: lines.map((l) => l.text).join("\n"),
        ErrorMessage: "",
        ErrorDetails: "",
      },
    ],
    OCRExitCode: 1,
    IsErroredOnProcessing: false,
    ErrorMessage: [],
    ErrorDetails: "",
  };
}

// Mock Image for getImageDimensions
function mockImage(width: number, height: number) {
  vi.stubGlobal(
    "Image",
    class {
      width = 0;
      height = 0;
      naturalWidth = width;
      naturalHeight = height;
      src = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );
}

describe("ocrPage", () => {
  it("sends image to OCR.space and returns parsed regions", async () => {
    mockImage(1000, 1500);

    const ocrResponse = makeOcrResponse([
      {
        text: "こんにちは",
        words: [
          { text: "こんにちは", left: 100, top: 200, width: 50, height: 300 },
        ],
      },
      {
        text: "世界",
        words: [{ text: "世界", left: 500, top: 100, width: 40, height: 200 }],
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ocrResponse,
    });

    const blob = new Blob(["fake-image"], { type: "image/png" });
    const result = await ocrPage(blob);

    expect(result.regions).toHaveLength(2);
    expect(result.regions[0]!.text).toBe("こんにちは");
    expect(result.regions[1]!.text).toBe("世界");

    // Check bounding box is converted to fractions
    const [x, y, w, h] = result.regions[0]!.bbox;
    expect(x).toBeCloseTo(0.1); // 100/1000
    expect(y).toBeCloseTo(200 / 1500);
    expect(w).toBeCloseTo(0.05); // 50/1000
    expect(h).toBeCloseTo(0.2); // 300/1500

    // Check fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.ocr.space/parse/image",
      expect.objectContaining({
        method: "POST",
        headers: { apikey: "test-ocr-key" },
      }),
    );

    // Check FormData contents
    const callArgs = mockFetch.mock.calls[0]!;
    const formData = callArgs[1].body as FormData;
    expect(formData.get("language")).toBe("jpn");
    expect(formData.get("OCREngine")).toBe("2");
    expect(formData.get("isOverlayRequired")).toBe("true");
  });

  it("throws on HTTP error", async () => {
    mockImage(100, 100);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    await expect(ocrPage(blob)).rejects.toThrow(
      "OCR.space API error: 403 Forbidden",
    );
  });

  it("throws on processing error", async () => {
    mockImage(100, 100);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ParsedResults: [
          {
            ErrorMessage: "Invalid image",
            ErrorDetails: "",
            ParsedText: "",
            TextOverlay: { Lines: [], HasOverlay: false },
          },
        ],
        OCRExitCode: 3,
        IsErroredOnProcessing: true,
        ErrorMessage: ["Invalid image format"],
        ErrorDetails: "",
      }),
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    await expect(ocrPage(blob)).rejects.toThrow("OCR.space processing error");
  });

  it("throws when no API key configured", async () => {
    await db.settings.delete("ocrSpaceApiKey");
    const blob = new Blob(["fake"], { type: "image/png" });
    await expect(ocrPage(blob)).rejects.toThrow(
      "No OCR.space API key configured",
    );
  });

  it("returns empty regions when no text found", async () => {
    mockImage(100, 100);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeOcrResponse([]),
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    const result = await ocrPage(blob);
    expect(result.regions).toHaveLength(0);
  });

  it("uses default settings when none configured", async () => {
    mockImage(100, 100);
    await db.settings.delete("ocrSpaceEngine");
    await db.settings.delete("ocrSpaceLanguage");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeOcrResponse([]),
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    await ocrPage(blob);

    const callArgs = mockFetch.mock.calls[0]!;
    const formData = callArgs[1].body as FormData;
    expect(formData.get("language")).toBe("jpn");
    expect(formData.get("OCREngine")).toBe("2");
  });
});

describe("testApiKey", () => {
  it("returns valid=true on successful API call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ParsedResults: [
          {
            ParsedText: "",
            ErrorMessage: "",
            ErrorDetails: "",
            TextOverlay: { Lines: [], HasOverlay: false },
          },
        ],
        OCRExitCode: 1,
        IsErroredOnProcessing: false,
        ErrorMessage: [],
        ErrorDetails: "",
      }),
    });

    const result = await testApiKey("valid-key");
    expect(result.valid).toBe(true);
  });

  it("returns valid=false on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const result = await testApiKey("bad-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("401");
  });

  it("returns valid=false on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await testApiKey("any-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("returns valid=false on processing error exit code", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ParsedResults: [],
        OCRExitCode: 4,
        IsErroredOnProcessing: true,
        ErrorMessage: ["Invalid key"],
        ErrorDetails: "",
      }),
    });

    const result = await testApiKey("invalid-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid key");
  });
});
