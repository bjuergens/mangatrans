import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db, type TextRegion, type Analysis } from "./db";
import { anthropic } from "./claude-api";
import { cropImage } from "./image-utils";
import { ocrSpace } from "./ocr-space-api";
import { createNavigate } from "./router";
import { Logger } from "./logger";

type OcrProvider = "claude" | "ocr-space";

const log = new Logger("ReaderPage");

interface RegionWithAnalysis {
  region: TextRegion;
  analysis?: Analysis;
}

const BOX_STEP = 0.02; // 2% of page per +/- click

export default function ReaderPage() {
  const { comicId, pageNumber } = useParams<{
    comicId: string;
    pageNumber: string;
  }>();
  const navigate = createNavigate(useNavigate());

  const comicIdNum = Number(comicId);
  const pageNum = Number(pageNumber);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageId, setPageId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pipeline state
  const [detecting, setDetecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [regions, setRegions] = useState<RegionWithAnalysis[]>([]);
  const [detected, setDetected] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasOcrSpaceKey, setHasOcrSpaceKey] = useState(false);
  const [ocrProvider, setOcrProvider] = useState<OcrProvider>("claude");

  // Box selection & editing
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);

  // Overlay interaction state
  // 0 = transparent (default), 1 = OCR text, 2 = translation
  const [regionDisplayMode, setRegionDisplayMode] = useState<
    Map<number, 1 | 2>
  >(new Map());
  // null = no tooltip; non-null = show tooltip for regionId at (x, y) within imageContainerRef
  const [tooltip, setTooltip] = useState<{
    regionId: number;
    x: number;
    y: number;
  } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  // Tracks which page is currently loaded. Set to null immediately on navigation
  // (before the async load resolves) so in-flight scan/analysis callbacks can
  // detect that the page has changed and skip state updates.
  const currentPageIdRef = useRef<number | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    // Invalidate immediately — any in-flight analysis for the previous page
    // will see null !== their captured pageId and abort state updates.
    currentPageIdRef.current = null;

    (async () => {
      try {
        const comic = await db.comics.get(comicIdNum);
        if (!comic) {
          setError(`Comic ${comicIdNum} not found`);
          return;
        }
        setTitle(comic.title);
        setPageCount(comic.pageCount);

        const page = await db.pages
          .where({ comicId: comicIdNum, pageNumber: pageNum })
          .first();
        if (!page) {
          setError(`Page ${pageNum} not found`);
          return;
        }

        setPageId(page.id);
        currentPageIdRef.current = page.id; // page is now current
        setDetected(!!page.detected);
        setScanned(!!page.scanned);

        objectUrl = URL.createObjectURL(page.imageBlob);
        setImageUrl(objectUrl);

        // Check for API keys
        const [apiKeySetting, ocrSpaceKeySetting] = await Promise.all([
          db.settings.get("apiKey"),
          db.settings.get("ocrSpaceApiKey"),
        ]);
        setHasApiKey(!!apiKeySetting?.value);
        setHasOcrSpaceKey(!!ocrSpaceKeySetting?.value);

        // Load existing text regions and analyses
        const existingRegions = await db.textRegions
          .where("pageId")
          .equals(page.id)
          .toArray();
        const regionsWithAnalysis: RegionWithAnalysis[] = await Promise.all(
          existingRegions.map(async (region) => {
            const analysis = await db.analyses
              .where("textRegionId")
              .equals(region.id)
              .first();
            return { region, analysis };
          }),
        );
        setRegions(regionsWithAnalysis);
      } catch (e) {
        log.error(`Failed to load page: ${e}`);
        setError("Failed to load page");
      }
    })();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [comicIdNum, pageNum]);

  // Reset interaction state when navigating pages
  useEffect(() => {
    setRegionDisplayMode(new Map());
    setTooltip(null);
    setSelectedRegionId(null);
  }, [pageNum]);

  // Stage 1: Detect text region bounding boxes (Claude or OCR.space)
  const handleDetect = useCallback(async () => {
    if (!pageId) return;
    const myPageId = pageId;
    setDetecting(true);
    setError(null);

    try {
      const page = await db.pages.get(myPageId);
      if (!page) {
        setError("Page not found");
        setDetecting(false);
        return;
      }

      // Clear old regions and analyses for this page
      const oldRegions = await db.textRegions
        .where("pageId")
        .equals(myPageId)
        .toArray();
      const oldRegionIds = oldRegions.map((r) => r.id);
      if (oldRegionIds.length > 0) {
        await db.analyses.where("textRegionId").anyOf(oldRegionIds).delete();
        await db.textRegions.where("pageId").equals(myPageId).delete();
      }

      let newRegions: RegionWithAnalysis[];

      if (ocrProvider === "ocr-space") {
        // OCR.space: detection + OCR in one call
        const result = await ocrSpace.ocrPage(page.imageBlob);

        const regionIds = (await db.textRegions.bulkAdd(
          result.regions.map((r) => ({
            pageId: myPageId,
            type: "dialogue" as const,
            text: r.text,
            bbox: r.bbox,
            textDirection: "ttb" as const,
            hasFurigana: false,
          })),
          { allKeys: true },
        )) as number[];

        // OCR.space does detection + OCR in one shot
        await db.pages.update(myPageId, {
          visualContext: "Page scanned via OCR.space",
          detected: true,
          scanned: true,
        });

        if (currentPageIdRef.current !== myPageId) return;

        setDetected(true);
        setScanned(true);

        newRegions = result.regions.map((r, i) => ({
          region: {
            id: regionIds[i]!,
            pageId: myPageId,
            type: "dialogue" as const,
            text: r.text,
            bbox: r.bbox,
            textDirection: "ttb" as const,
            hasFurigana: false,
          },
          analysis: undefined,
        }));
      } else {
        // Claude: detection only (OCR is a separate step)
        const result = await anthropic.detectRegions(page.imageBlob);

        const regionIds = (await db.textRegions.bulkAdd(
          result.regions.map((r) => ({
            pageId: myPageId,
            type: r.type,
            text: "",
            bbox: r.bbox,
            textDirection: r.textDirection,
            hasFurigana: r.hasFurigana,
          })),
          { allKeys: true },
        )) as number[];

        await db.pages.update(myPageId, {
          visualContext: result.visualContext,
          detected: true,
          scanned: false,
        });

        if (currentPageIdRef.current !== myPageId) return;

        setDetected(true);
        setScanned(false);

        newRegions = result.regions.map((r, i) => ({
          region: {
            id: regionIds[i]!,
            pageId: myPageId,
            type: r.type,
            text: "",
            bbox: r.bbox,
            textDirection: r.textDirection,
            hasFurigana: r.hasFurigana,
          },
          analysis: undefined,
        }));
      }

      setRegions(newRegions);
      setRegionDisplayMode(new Map());
      setTooltip(null);
      setSelectedRegionId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Detection failed: ${msg}`);
      setError(`Detection failed: ${msg}`);
    } finally {
      setDetecting(false);
    }
  }, [pageId, ocrProvider]);

  // Stage 2: OCR each detected region by cropping and sending to Claude
  const handleReadText = useCallback(async () => {
    if (!pageId || regions.length === 0) return;
    const myPageId = pageId;
    setScanning(true);
    setError(null);

    try {
      const page = await db.pages.get(myPageId);
      if (!page) {
        setError("Page not found");
        setScanning(false);
        return;
      }

      for (let i = 0; i < regions.length; i++) {
        const entry = regions[i]!;
        if (entry.region.text) continue; // already has OCR text

        setScanProgress(`Reading region ${i + 1}/${regions.length}...`);

        const cropped = await cropImage(page.imageBlob, entry.region.bbox);
        const result = await anthropic.ocrRegion(cropped);

        // Update text in DB
        await db.textRegions.update(entry.region.id, { text: result.text });

        if (currentPageIdRef.current !== myPageId) return;

        // Update state
        setRegions((prev) =>
          prev.map((r) =>
            r.region.id === entry.region.id
              ? { ...r, region: { ...r.region, text: result.text } }
              : r,
          ),
        );
      }

      // Mark page as scanned
      await db.pages.update(myPageId, { scanned: true });

      if (currentPageIdRef.current !== myPageId) return;
      setScanned(true);
      setScanProgress("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`OCR failed: ${msg}`);
      setError(`OCR failed: ${msg}`);
    } finally {
      setScanning(false);
      setScanProgress("");
    }
  }, [pageId, regions]);

  const handleAnalyze = useCallback(async () => {
    if (!pageId || regions.length === 0) return;
    const myPageId = pageId; // capture — used to detect stale callbacks after navigation
    setAnalyzing(true);
    setError(null);

    try {
      const page = await db.pages.get(myPageId);
      if (!page?.visualContext) {
        setError("Page has not been scanned yet. Scan first.");
        setAnalyzing(false);
        return;
      }

      for (let i = 0; i < regions.length; i++) {
        const entry = regions[i]!;
        if (entry.analysis) continue; // Skip already analyzed

        setAnalyzeProgress(`Analyzing region ${i + 1}/${regions.length}...`);

        const result = await anthropic.analyzeTextRegion(
          entry.region.text,
          entry.region.type,
          page.visualContext,
        );

        // Write to DB — valid regardless of whether user has navigated away
        await db.analyses.add({
          textRegionId: entry.region.id,
          vocabulary: result.vocabulary,
          grammar: result.grammar,
          suggestedTranslation: result.suggestedTranslation,
          rawResponse: result.rawResponse,
        });

        // Guard: don't update state if user navigated to a different page
        if (currentPageIdRef.current !== myPageId) return;

        // Re-read from DB — DB is the single source of truth for region data
        const analysis = await db.analyses
          .where("textRegionId")
          .equals(entry.region.id)
          .first();
        setRegions((prev) =>
          prev.map((r) =>
            r.region.id === entry.region.id ? { ...r, analysis } : r,
          ),
        );
      }

      setAnalyzeProgress("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Analysis failed: ${msg}`);
      setError(`Analysis failed: ${msg}`);
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress("");
    }
  }, [pageId, regions]);

  function goToPage(n: number) {
    navigate(`/reader/${comicIdNum}/${n}`);
  }

  // Cycles the display mode for a region: transparent → OCR text → translation → transparent.
  // Skips the translation step when the region has not been analyzed yet.
  function cycleRegionDisplay(regionId: number) {
    const canShowTranslation = regions.some(
      (r) => r.region.id === regionId && !!r.analysis,
    );
    setRegionDisplayMode((prev) => {
      const next = new Map(prev);
      const current = next.get(regionId) ?? 0;
      if (current === 0) {
        next.set(regionId, 1);
      } else if (current === 1 && canShowTranslation) {
        next.set(regionId, 2);
      } else {
        next.delete(regionId);
      }
      return next;
    });
  }

  function handleRegionClick(regionId: number) {
    // If we're in editing mode (detected but not yet scanned), select the box
    if (detected && !scanned) {
      setSelectedRegionId((prev) => (prev === regionId ? null : regionId));
    } else {
      cycleRegionDisplay(regionId);
    }
  }

  function handleRegionMouseEnter(
    regionId: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    setTooltip({ regionId, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  function handleRegionMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    setTooltip((prev) =>
      prev
        ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top }
        : null,
    );
  }

  // --- Box editing helpers ---

  async function updateRegionInDb(
    regionId: number,
    updates: Partial<TextRegion>,
  ) {
    await db.textRegions.update(regionId, updates);
    setRegions((prev) =>
      prev.map((r) =>
        r.region.id === regionId
          ? { ...r, region: { ...r.region, ...updates } }
          : r,
      ),
    );
  }

  function adjustBbox(
    regionId: number,
    field: "x" | "y" | "w" | "h",
    delta: number,
  ) {
    const entry = regions.find((r) => r.region.id === regionId);
    if (!entry) return;
    const [x, y, w, h] = entry.region.bbox;
    let newBbox: [number, number, number, number];
    if (field === "x") {
      newBbox = [Math.max(0, Math.min(1 - w, x + delta)), y, w, h];
    } else if (field === "y") {
      newBbox = [x, Math.max(0, Math.min(1 - h, y + delta)), w, h];
    } else if (field === "w") {
      newBbox = [x, y, Math.max(0.02, Math.min(1, w + delta)), h];
    } else {
      newBbox = [x, y, w, Math.max(0.02, Math.min(1, h + delta))];
    }
    updateRegionInDb(regionId, { bbox: newBbox });
  }

  function toggleFurigana(regionId: number) {
    const entry = regions.find((r) => r.region.id === regionId);
    if (!entry) return;
    updateRegionInDb(regionId, { hasFurigana: !entry.region.hasFurigana });
  }

  function setRegionType(regionId: number, type: TextRegion["type"]) {
    updateRegionInDb(regionId, { type });
  }

  async function deleteRegion(regionId: number) {
    await db.analyses.where("textRegionId").equals(regionId).delete();
    await db.textRegions.delete(regionId);
    setRegions((prev) => prev.filter((r) => r.region.id !== regionId));
    if (selectedRegionId === regionId) setSelectedRegionId(null);
  }

  async function addRegion() {
    if (!pageId) return;
    const id = (await db.textRegions.add({
      pageId,
      type: "dialogue",
      text: "",
      bbox: [0.4, 0.4, 0.15, 0.15],
      textDirection: "ttb",
      hasFurigana: false,
    })) as number;
    const newRegion: RegionWithAnalysis = {
      region: {
        id,
        pageId,
        type: "dialogue",
        text: "",
        bbox: [0.4, 0.4, 0.15, 0.15],
        textDirection: "ttb",
        hasFurigana: false,
      },
      analysis: undefined,
    };
    setRegions((prev) => [...prev, newRegion]);
    setSelectedRegionId(id);
  }

  const busy = detecting || scanning || analyzing;
  const canDetect = ocrProvider === "claude" ? hasApiKey : hasOcrSpaceKey;
  const hasBothKeys = hasApiKey && hasOcrSpaceKey;
  const allAnalyzed =
    regions.length > 0 && regions.every((r) => r.analysis !== undefined);
  const someAnalyzed = regions.some((r) => r.analysis !== undefined);
  const allHaveText =
    regions.length > 0 && regions.every((r) => r.region.text.length > 0);
  const selectedRegion = selectedRegionId
    ? regions.find((r) => r.region.id === selectedRegionId)
    : null;

  if (error && !imageUrl) {
    return (
      <div className="p-4">
        <p className="text-red-600" data-testid="reader-error">
          {error}
        </p>
        <Link
          to="/"
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          Back to Library
        </Link>
      </div>
    );
  }

  const tooltipRegion = tooltip
    ? regions.find((r) => r.region.id === tooltip.regionId)
    : null;

  return (
    <div className="flex flex-col items-center p-4">
      {/* Header */}
      <div className="mb-4 flex w-full items-center justify-between">
        <Link
          to="/"
          className="text-sm text-blue-600 hover:underline"
          data-testid="back-to-library"
        >
          &larr; Library
        </Link>
        <h1 className="text-lg font-bold" data-testid="reader-title">
          {title}
        </h1>
        <span className="text-sm text-gray-500" data-testid="page-indicator">
          {pageNum} / {pageCount}
        </span>
      </div>

      {/* Action buttons */}
      <div
        className="mb-3 flex flex-wrap items-center gap-2"
        data-testid="scan-controls"
      >
        {/* Stage 1: Detect boxes */}
        <button
          onClick={handleDetect}
          disabled={!canDetect || busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="detect-boxes-btn"
        >
          {detecting
            ? "Detecting..."
            : detected
              ? "Re-detect Boxes"
              : "Detect Boxes"}
        </button>

        {/* OCR provider toggle — visible when both keys are configured */}
        {hasBothKeys && (
          <div
            className="flex items-center gap-3 text-sm"
            data-testid="ocr-provider-toggle"
          >
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="ocrProvider"
                value="claude"
                checked={ocrProvider === "claude"}
                onChange={() => setOcrProvider("claude")}
                disabled={busy}
              />
              <span>Claude</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="ocrProvider"
                value="ocr-space"
                checked={ocrProvider === "ocr-space"}
                onChange={() => setOcrProvider("ocr-space")}
                disabled={busy}
              />
              <span>OCR.space</span>
            </label>
          </div>
        )}

        {/* Stage 2: Read text (OCR each box) */}
        {detected && regions.length > 0 && !allHaveText && (
          <button
            onClick={handleReadText}
            disabled={!hasApiKey || busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            data-testid="read-text-btn"
          >
            {scanning ? scanProgress || "Reading..." : "Read Text"}
          </button>
        )}

        {/* Stage 3: Analyze (existing) */}
        {scanned && regions.length > 0 && !allAnalyzed && (
          <button
            onClick={handleAnalyze}
            disabled={!hasApiKey || busy}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            data-testid="analyze-btn"
          >
            {analyzing ? analyzeProgress || "Analyzing..." : "Analyze All"}
          </button>
        )}

        {/* Add box button — visible when in box-editing mode */}
        {detected && !scanned && (
          <button
            onClick={addRegion}
            disabled={busy}
            className="rounded-lg bg-gray-600 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            data-testid="add-box-btn"
            title="Add a new text region"
          >
            + Box
          </button>
        )}

        {regions.length > 0 && (
          <span className="text-xs text-gray-500">
            {regions.length} region{regions.length !== 1 ? "s" : ""}
            {someAnalyzed &&
              ` — ${regions.filter((r) => r.analysis).length} analyzed`}
          </span>
        )}
      </div>

      {/* No API key info */}
      {!hasApiKey && !hasOcrSpaceKey && (
        <div
          className="mb-3 w-full max-w-2xl rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700"
          data-testid="no-api-key-info"
        >
          Add your Claude API key or OCR.space API key in{" "}
          <Link to="/settings" className="underline hover:text-blue-900">
            Settings
          </Link>{" "}
          to enable scanning and analysis.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          className="mb-3 w-full max-w-2xl rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          data-testid="reader-error"
        >
          {error}
        </div>
      )}

      {/* Page image with text region overlays */}
      <div
        className="flex w-full max-w-2xl items-center justify-center rounded bg-gray-100"
        data-testid="page-container"
      >
        {imageUrl ? (
          <div ref={imageContainerRef} className="relative inline-block">
            <img
              src={imageUrl}
              alt={`${title} page ${pageNum}`}
              className="max-h-[80vh] w-auto rounded"
              data-testid="page-image"
            />
            {/* Text region overlays — positioned as % of rendered image size */}
            {regions.map(({ region, analysis }) => {
              const [x, y, w, h] = region.bbox;
              const displayMode = regionDisplayMode.get(region.id) ?? 0;
              const isSelected = region.id === selectedRegionId;
              const borderColor = isSelected
                ? "border-blue-500"
                : analysis
                  ? "border-green-400"
                  : region.text
                    ? "border-yellow-400"
                    : "border-orange-400";

              return (
                <div
                  key={region.id}
                  className={`absolute cursor-pointer border-2 ${borderColor} transition-colors hover:bg-black/10 ${isSelected ? "ring-2 ring-blue-300" : ""}`}
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    width: `${w * 100}%`,
                    height: `${h * 100}%`,
                  }}
                  data-testid={`text-region-${region.id}`}
                  onClick={() => handleRegionClick(region.id)}
                  onMouseEnter={(e) => handleRegionMouseEnter(region.id, e)}
                  onMouseMove={handleRegionMouseMove}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* State 1: OCR text */}
                  {displayMode === 1 && region.text && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white/90 p-1">
                      <span className="text-center text-xs leading-tight text-gray-800">
                        {region.text}
                      </span>
                    </div>
                  )}
                  {/* State 2: Translation */}
                  {displayMode === 2 && analysis && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white/90 p-1">
                      <span className="text-center text-xs leading-tight text-gray-800">
                        {analysis.suggestedTranslation}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Hover tooltip */}
            {tooltip && tooltipRegion?.analysis && (
              <div
                className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
                style={{
                  left: `${tooltip.x + 12}px`,
                  top: `${tooltip.y + 12}px`,
                }}
                data-testid="region-tooltip"
              >
                <p className="mb-1 text-sm font-bold text-gray-900">
                  {tooltipRegion.region.text}
                </p>

                {/* Vocabulary */}
                {tooltipRegion.analysis.vocabulary.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-blue-600">
                      Vocabulary
                    </p>
                    <ul className="space-y-0.5">
                      {tooltipRegion.analysis.vocabulary.map((v, i) => (
                        <li key={i} className="text-xs text-gray-700">
                          <span className="font-medium">{v.word}</span>
                          {v.reading !== v.word && (
                            <span className="text-gray-400">
                              {" "}
                              ({v.reading})
                            </span>
                          )}
                          {" — "}
                          <span className="text-gray-500">{v.definition}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Grammar */}
                {tooltipRegion.analysis.grammar.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-purple-600">
                      Grammar
                    </p>
                    <ul className="space-y-0.5">
                      {tooltipRegion.analysis.grammar.map((g, i) => (
                        <li key={i} className="text-xs text-gray-700">
                          <span className="font-medium">{g.pattern}</span>
                          {" — "}
                          <span className="text-gray-500">{g.explanation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-12 text-gray-400">Loading page...</div>
        )}
      </div>

      {/* Box editing controls — shown when a region is selected and we're in edit mode */}
      {selectedRegion && detected && !scanned && (
        <div
          className="mt-3 w-full max-w-2xl rounded border border-gray-200 bg-white p-3 shadow-sm"
          data-testid="box-editor"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              Edit Region #{selectedRegion.region.id}
            </span>
            <button
              onClick={() => deleteRegion(selectedRegion.region.id)}
              className="rounded bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200"
              data-testid="delete-region-btn"
            >
              Delete
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Position X */}
            <div className="flex items-center gap-1">
              <span className="text-gray-500">X:</span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "x", -BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="x-minus-btn"
              >
                -
              </button>
              <span className="w-10 text-center">
                {Math.round(selectedRegion.region.bbox[0] * 100)}%
              </span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "x", BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="x-plus-btn"
              >
                +
              </button>
            </div>

            {/* Position Y */}
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Y:</span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "y", -BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="y-minus-btn"
              >
                -
              </button>
              <span className="w-10 text-center">
                {Math.round(selectedRegion.region.bbox[1] * 100)}%
              </span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "y", BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="y-plus-btn"
              >
                +
              </button>
            </div>

            {/* Width */}
            <div className="flex items-center gap-1">
              <span className="text-gray-500">W:</span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "w", -BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="w-minus-btn"
              >
                -
              </button>
              <span className="w-10 text-center">
                {Math.round(selectedRegion.region.bbox[2] * 100)}%
              </span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "w", BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="w-plus-btn"
              >
                +
              </button>
            </div>

            {/* Height */}
            <div className="flex items-center gap-1">
              <span className="text-gray-500">H:</span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "h", -BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="h-minus-btn"
              >
                -
              </button>
              <span className="w-10 text-center">
                {Math.round(selectedRegion.region.bbox[3] * 100)}%
              </span>
              <button
                onClick={() =>
                  adjustBbox(selectedRegion.region.id, "h", BOX_STEP)
                }
                className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200"
                data-testid="h-plus-btn"
              >
                +
              </button>
            </div>

            {/* Furigana toggle */}
            <button
              onClick={() => toggleFurigana(selectedRegion.region.id)}
              className={`rounded px-2 py-1 ${
                selectedRegion.region.hasFurigana
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
              data-testid="furigana-toggle-btn"
            >
              Furigana
            </button>

            {/* Region type */}
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Type:</span>
              {(["dialogue", "narration", "sfx"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRegionType(selectedRegion.region.id, t)}
                  className={`rounded px-2 py-1 ${
                    selectedRegion.region.type === t
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                  data-testid={`type-${t}-btn`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={() => goToPage(pageNum - 1)}
          disabled={pageNum <= 1}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="prev-page"
        >
          Previous
        </button>
        <button
          onClick={() => goToPage(pageNum + 1)}
          disabled={pageNum >= pageCount}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
          data-testid="next-page"
        >
          Next
        </button>
      </div>
    </div>
  );
}
