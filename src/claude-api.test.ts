import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { testApiKey, scanPage, analyzeTextRegion } from "./claude-api";

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("testApiKey", () => {
  it("returns valid=true with model list on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "claude-sonnet-4-20250514",
            display_name: "Claude Sonnet 4",
            created_at: "2025-05-14",
            type: "model",
          },
        ],
      }),
    });

    const result = await testApiKey("sk-ant-test");
    expect(result.valid).toBe(true);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]!.display_name).toBe("Claude Sonnet 4");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "x-api-key": "sk-ant-test" }),
      }),
    );
  });

  it("returns valid=false with error on HTTP failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_api_key"}',
    });

    const result = await testApiKey("bad-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("API key test failed");
  });
});

describe("scanPage", () => {
  it("sends image to vision API and returns parsed regions", async () => {
    const scanResult = {
      regions: [
        {
          type: "dialogue",
          text: "こんにちは",
          bbox: [0.1, 0.2, 0.3, 0.1],
        },
      ],
      visualContext: "A girl greeting someone in a park",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(scanResult) }],
      }),
    });

    const blob = new Blob(["fake-image"], { type: "image/jpeg" });
    const result = await scanPage("sk-ant-test", blob);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.text).toBe("こんにちは");
    expect(result.regions[0]!.type).toBe("dialogue");
    expect(result.visualContext).toBe("A girl greeting someone in a park");
    expect(result.rawResponse).toBe(JSON.stringify(scanResult));

    // Verify the API was called with vision content
    const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(callBody.messages[0].content[0].type).toBe("image");
    expect(callBody.messages[0].content[0].source.type).toBe("base64");
  });

  it("handles response wrapped in markdown code fences", async () => {
    const scanResult = {
      regions: [
        { type: "dialogue", text: "テスト", bbox: [0.1, 0.2, 0.3, 0.1] },
      ],
      visualContext: "Test context",
    };
    const wrapped = "```json\n" + JSON.stringify(scanResult, null, 2) + "\n```";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: wrapped }],
      }),
    });

    const blob = new Blob(["fake-image"], { type: "image/jpeg" });
    const result = await scanPage("sk-ant-test", blob);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.text).toBe("テスト");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal error",
    });

    const blob = new Blob(["fake"], { type: "image/jpeg" });
    await expect(scanPage("sk-ant-test", blob)).rejects.toThrow(
      "Page scan failed",
    );
  });
});

describe("analyzeTextRegion", () => {
  it("sends text to API and returns vocabulary, grammar, translation", async () => {
    const analysisResult = {
      vocabulary: [
        {
          word: "こんにちは",
          reading: "こんにちは",
          dictionaryForm: "こんにちは",
          partOfSpeech: "interjection",
          definition: "hello",
        },
      ],
      grammar: [
        {
          pattern: "greeting",
          explanation: "Standard daytime greeting",
        },
      ],
      suggestedTranslation: "Hello!",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(analysisResult) }],
      }),
    });

    const result = await analyzeTextRegion(
      "sk-ant-test",
      "こんにちは",
      "dialogue",
      "A girl in a park",
    );

    expect(result.vocabulary).toHaveLength(1);
    expect(result.vocabulary[0]!.definition).toBe("hello");
    expect(result.grammar).toHaveLength(1);
    expect(result.suggestedTranslation).toBe("Hello!");

    const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(callBody.messages[0].content).toContain("こんにちは");
    expect(callBody.messages[0].content).toContain("A girl in a park");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(
      analyzeTextRegion("sk-ant-test", "test", "dialogue", "context"),
    ).rejects.toThrow("Analysis failed");
  });
});
