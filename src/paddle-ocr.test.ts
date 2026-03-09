import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { paddleOcrRegion } from "./paddle-ocr";
import { db } from "./db";

const mockFetch = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("fetch", mockFetch);
  await db.settings.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("paddleOcrRegion", () => {
  it("sends image to PaddleOCR server and returns text", async () => {
    const paddleResponse = {
      results: [
        {
          data: [
            { text: "こんにちは", confidence: 0.98 },
            { text: "世界", confidence: 0.95 },
          ],
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => paddleResponse,
    });

    const blob = new Blob(["fake-image"], { type: "image/png" });
    const result = await paddleOcrRegion(blob);

    expect(result.text).toBe("こんにちは世界");
    expect(result.rawResponse).toBe(JSON.stringify(paddleResponse));

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8866/predict/ocr_system",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(callBody.images).toHaveLength(1);
    expect(typeof callBody.images[0]).toBe("string");
  });

  it("uses custom server URL from settings", async () => {
    await db.settings.put({
      key: "paddleOcrUrl",
      value: "http://my-server:9000",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ data: [{ text: "テスト", confidence: 0.99 }] }],
      }),
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    await paddleOcrRegion(blob);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://my-server:9000/predict/ocr_system",
      expect.anything(),
    );
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    await expect(paddleOcrRegion(blob)).rejects.toThrow(
      "PaddleOCR server error (500)",
    );
  });

  it("handles empty results gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ data: [] }] }),
    });

    const blob = new Blob(["fake"], { type: "image/png" });
    const result = await paddleOcrRegion(blob);
    expect(result.text).toBe("");
  });
});
