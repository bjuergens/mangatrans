import { useState, useEffect } from "react";
import { db } from "./db";
import { anthropic, type ModelInfo } from "./claude-api";
import {
  testApiKey as testOcrSpaceApiKey,
  type OcrSpaceTestResult,
} from "./ocr-space-api";
import { redirectToAppRoot, assetUrl } from "./router";

type TextExtractionBackend = "ai-vision" | "local-ocr";
type AnalysisDetailLevel = "basic" | "detailed";
type OcrSpaceEngine = "1" | "2";
type OcrSpaceLanguage = "jpn" | "chs" | "cht" | "kor" | "eng";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState("");
  const [textExtraction, setTextExtraction] =
    useState<TextExtractionBackend>("ai-vision");
  const [analysisDetail, setAnalysisDetail] =
    useState<AnalysisDetailLevel>("detailed");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    models: ModelInfo[];
    error?: string;
  } | null>(null);

  // OCR.space settings
  const [ocrSpaceApiKey, setOcrSpaceApiKey] = useState("");
  const [savedOcrSpaceApiKey, setSavedOcrSpaceApiKey] = useState("");
  const [ocrSpaceEngine, setOcrSpaceEngine] = useState<OcrSpaceEngine>("2");
  const [ocrSpaceLanguage, setOcrSpaceLanguage] =
    useState<OcrSpaceLanguage>("jpn");
  const [savingOcrSpace, setSavingOcrSpace] = useState(false);
  const [testingOcrSpace, setTestingOcrSpace] = useState(false);
  const [ocrSpaceTestResult, setOcrSpaceTestResult] =
    useState<OcrSpaceTestResult | null>(null);

  useEffect(() => {
    async function load() {
      const [
        apiKeySetting,
        extractionSetting,
        detailSetting,
        ocrSpaceKeySetting,
        ocrSpaceEngineSetting,
        ocrSpaceLanguageSetting,
      ] = await Promise.all([
        db.settings.get("apiKey"),
        db.settings.get("textExtractionBackend"),
        db.settings.get("analysisDetailLevel"),
        db.settings.get("ocrSpaceApiKey"),
        db.settings.get("ocrSpaceEngine"),
        db.settings.get("ocrSpaceLanguage"),
      ]);
      if (apiKeySetting) {
        setApiKey(apiKeySetting.value);
        setSavedApiKey(apiKeySetting.value);
      }
      if (extractionSetting) {
        setTextExtraction(extractionSetting.value as TextExtractionBackend);
      }
      if (detailSetting) {
        setAnalysisDetail(detailSetting.value as AnalysisDetailLevel);
      }
      if (ocrSpaceKeySetting) {
        setOcrSpaceApiKey(ocrSpaceKeySetting.value);
        setSavedOcrSpaceApiKey(ocrSpaceKeySetting.value);
      }
      if (ocrSpaceEngineSetting) {
        setOcrSpaceEngine(ocrSpaceEngineSetting.value as OcrSpaceEngine);
      }
      if (ocrSpaceLanguageSetting) {
        setOcrSpaceLanguage(ocrSpaceLanguageSetting.value as OcrSpaceLanguage);
      }
      setLoaded(true);
    }
    load();
  }, []);

  async function saveApiKey() {
    setSaving(true);
    await db.settings.put({ key: "apiKey", value: apiKey.trim() });
    setSavedApiKey(apiKey.trim());
    setSaving(false);
  }

  async function clearApiKey() {
    await db.settings.delete("apiKey");
    setApiKey("");
    setSavedApiKey("");
    setTestResult(null);
  }

  async function handleTestApiKey() {
    setTesting(true);
    setTestResult(null);
    const result = await anthropic.testApiKey();
    setTestResult(result);
    setTesting(false);
  }

  async function saveTextExtraction(value: TextExtractionBackend) {
    setTextExtraction(value);
    await db.settings.put({ key: "textExtractionBackend", value });
  }

  async function saveOcrSpaceApiKey() {
    setSavingOcrSpace(true);
    await db.settings.put({
      key: "ocrSpaceApiKey",
      value: ocrSpaceApiKey.trim(),
    });
    setSavedOcrSpaceApiKey(ocrSpaceApiKey.trim());
    setSavingOcrSpace(false);
  }

  async function clearOcrSpaceApiKey() {
    await db.settings.delete("ocrSpaceApiKey");
    setOcrSpaceApiKey("");
    setSavedOcrSpaceApiKey("");
    setOcrSpaceTestResult(null);
  }

  async function handleTestOcrSpaceApiKey() {
    setTestingOcrSpace(true);
    setOcrSpaceTestResult(null);
    const result = await testOcrSpaceApiKey(savedOcrSpaceApiKey);
    setOcrSpaceTestResult(result);
    setTestingOcrSpace(false);
  }

  async function saveOcrSpaceEngine(value: OcrSpaceEngine) {
    setOcrSpaceEngine(value);
    await db.settings.put({ key: "ocrSpaceEngine", value });
  }

  async function saveOcrSpaceLanguage(value: OcrSpaceLanguage) {
    setOcrSpaceLanguage(value);
    await db.settings.put({ key: "ocrSpaceLanguage", value });
  }

  async function saveAnalysisDetail(value: AnalysisDetailLevel) {
    setAnalysisDetail(value);
    await db.settings.put({ key: "analysisDetailLevel", value });
  }

  async function resetApp() {
    if (
      !window.confirm(
        "This will delete all your data (comics, settings, API key) and reload the app. Are you sure?",
      )
    )
      return;
    setResetting(true);
    await db.delete();
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    redirectToAppRoot();
  }

  const apiKeyDirty = apiKey.trim() !== savedApiKey;
  const ocrSpaceApiKeyDirty = ocrSpaceApiKey.trim() !== savedOcrSpaceApiKey;

  if (!loaded) return null;

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      {/* API Key */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Anthropic API Key</h2>
        <p className="mb-3 text-sm text-gray-500">
          Your API key is stored locally in your browser and only sent to
          Anthropic&apos;s API when you trigger analysis. Get your key at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            console.anthropic.com
          </a>{" "}
          &rarr; Settings &rarr; API Keys &rarr; Create Key.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 rounded border px-3 py-2"
            data-testid="api-key-input"
          />
          <button
            onClick={saveApiKey}
            disabled={saving || !apiKeyDirty || !apiKey.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            data-testid="save-api-key"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {savedApiKey && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-600">API key saved</span>
              <button
                onClick={clearApiKey}
                className="text-sm text-red-500 hover:underline"
                data-testid="clear-api-key"
              >
                Clear
              </button>
              <button
                onClick={handleTestApiKey}
                disabled={testing}
                className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                data-testid="test-api-key"
              >
                {testing ? "Testing..." : "Test Key"}
              </button>
            </div>
            {testResult && (
              <div
                className={`rounded border p-3 text-sm ${testResult.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
                data-testid="api-key-test-result"
              >
                {testResult.valid ? (
                  <>
                    <p className="font-medium text-green-700">
                      API key is valid
                    </p>
                    <p className="mt-1 text-green-600">
                      {testResult.models.length} models available
                    </p>
                    <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-green-600">
                      {testResult.models.map((m) => (
                        <li key={m.id}>{m.display_name || m.id}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-red-700">
                      API key test failed
                    </p>
                    <p className="mt-1 text-xs text-red-500">
                      {testResult.error}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* OCR.space API */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">OCR.space API</h2>
        <p className="mb-3 text-sm text-gray-500">
          Alternative OCR provider for text detection. Get a free API key at{" "}
          <a
            href="https://ocr.space/ocrapi/freekey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            ocr.space
          </a>
          . When both keys are configured, you can choose which provider to use
          in the reader.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={ocrSpaceApiKey}
            onChange={(e) => setOcrSpaceApiKey(e.target.value)}
            placeholder="OCR.space API key..."
            className="flex-1 rounded border px-3 py-2"
            data-testid="ocr-space-api-key-input"
          />
          <button
            onClick={saveOcrSpaceApiKey}
            disabled={
              savingOcrSpace || !ocrSpaceApiKeyDirty || !ocrSpaceApiKey.trim()
            }
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            data-testid="save-ocr-space-api-key"
          >
            {savingOcrSpace ? "Saving..." : "Save"}
          </button>
        </div>
        {savedOcrSpaceApiKey && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-600">API key saved</span>
              <button
                onClick={clearOcrSpaceApiKey}
                className="text-sm text-red-500 hover:underline"
                data-testid="clear-ocr-space-api-key"
              >
                Clear
              </button>
              <button
                onClick={handleTestOcrSpaceApiKey}
                disabled={testingOcrSpace}
                className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                data-testid="test-ocr-space-api-key"
              >
                {testingOcrSpace ? "Testing..." : "Test Key"}
              </button>
            </div>
            {ocrSpaceTestResult && (
              <div
                className={`rounded border p-3 text-sm ${ocrSpaceTestResult.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
                data-testid="ocr-space-test-result"
              >
                {ocrSpaceTestResult.valid ? (
                  <p className="font-medium text-green-700">API key is valid</p>
                ) : (
                  <>
                    <p className="font-medium text-red-700">
                      API key test failed
                    </p>
                    <p className="mt-1 text-xs text-red-500">
                      {ocrSpaceTestResult.error}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* OCR Engine */}
            <div className="mt-3">
              <p className="mb-1 text-sm font-medium text-gray-700">
                OCR Engine
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ocrSpaceEngine"
                    value="1"
                    checked={ocrSpaceEngine === "1"}
                    onChange={() => saveOcrSpaceEngine("1")}
                  />
                  <span className="text-sm">
                    Engine 1
                    <span className="ml-1 text-xs text-gray-400">
                      — fast, horizontal text
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="ocrSpaceEngine"
                    value="2"
                    checked={ocrSpaceEngine === "2"}
                    onChange={() => saveOcrSpaceEngine("2")}
                  />
                  <span className="text-sm">
                    Engine 2
                    <span className="ml-1 text-xs text-gray-400">
                      — vertical text support
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Language */}
            <div className="mt-3">
              <p className="mb-1 text-sm font-medium text-gray-700">Language</p>
              <select
                value={ocrSpaceLanguage}
                onChange={(e) =>
                  saveOcrSpaceLanguage(e.target.value as OcrSpaceLanguage)
                }
                className="rounded border px-3 py-1.5 text-sm"
                data-testid="ocr-space-language-select"
              >
                <option value="jpn">Japanese</option>
                <option value="chs">Chinese (Simplified)</option>
                <option value="cht">Chinese (Traditional)</option>
                <option value="kor">Korean</option>
                <option value="eng">English</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Text Extraction Backend */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Text Extraction</h2>
        <p className="mb-3 text-sm text-gray-500">
          How text is extracted from manga pages.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="textExtraction"
              value="ai-vision"
              checked={textExtraction === "ai-vision"}
              onChange={() => saveTextExtraction("ai-vision")}
            />
            <span>
              <span className="font-medium">AI Vision</span>
              <span className="ml-1 text-sm text-gray-500">
                — send page to Claude for OCR (requires API key)
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="textExtraction"
              value="local-ocr"
              checked={textExtraction === "local-ocr"}
              onChange={() => saveTextExtraction("local-ocr")}
            />
            <span>
              <span className="font-medium">Local OCR</span>
              <span className="ml-1 text-sm text-gray-500">
                — runs in browser, no network needed
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Analysis Detail Level */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Analysis Detail</h2>
        <p className="mb-3 text-sm text-gray-500">
          How much detail to include in vocabulary and grammar breakdowns.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="analysisDetail"
              value="basic"
              checked={analysisDetail === "basic"}
              onChange={() => saveAnalysisDetail("basic")}
            />
            <span>
              <span className="font-medium">Basic</span>
              <span className="ml-1 text-sm text-gray-500">
                — word definitions and key grammar only
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="analysisDetail"
              value="detailed"
              checked={analysisDetail === "detailed"}
              onChange={() => saveAnalysisDetail("detailed")}
            />
            <span>
              <span className="font-medium">Detailed</span>
              <span className="ml-1 text-sm text-gray-500">
                — full breakdowns with readings, conjugations, and nuance
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Reset */}
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Reset</h2>
        <p className="mb-3 text-sm text-gray-500">
          Delete all data and start fresh. This removes all comics, analyses,
          settings, and cached data.
        </p>
        <button
          onClick={resetApp}
          disabled={resetting}
          className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
          data-testid="reset-app"
        >
          {resetting ? "Resetting..." : "Reset Everything"}
        </button>
      </section>

      {/* Build Info */}
      <section className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-400">
        <p>
          Build:{" "}
          <a
            href={assetUrl("ci-logs.all.txt")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 hover:underline"
            data-testid="build-log-link"
          >
            {__BUILD_TIMESTAMP__} ({timeAgo(__BUILD_TIMESTAMP__)})
          </a>
        </p>
        <a
          href="https://github.com/bjuergens/mangatrans"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 hover:underline"
        >
          github.com/bjuergens/mangatrans
        </a>
      </section>
    </div>
  );
}
