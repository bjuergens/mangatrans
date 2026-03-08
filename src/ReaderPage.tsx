import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db, type TextRegion, type Analysis } from "./db";
import { scanPage, analyzeTextRegion } from "./claude-api";
import { Logger } from "./logger";

const log = new Logger("ReaderPage");

interface RegionWithAnalysis {
  region: TextRegion;
  analysis?: Analysis;
}

export default function ReaderPage() {
  const { comicId, pageNumber } = useParams<{
    comicId: string;
    pageNumber: string;
  }>();
  const navigate = useNavigate();

  const comicIdNum = Number(comicId);
  const pageNum = Number(pageNumber);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageId, setPageId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Scan / analysis state
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [regions, setRegions] = useState<RegionWithAnalysis[]>([]);
  const [scanned, setScanned] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Overlay interaction state
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [toggledRegions, setToggledRegions] = useState<Set<number>>(new Set());
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

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
        setScanned(!!page.scanned);

        objectUrl = URL.createObjectURL(page.imageBlob);
        setImageUrl(objectUrl);

        // Check for API key
        const apiKeySetting = await db.settings.get("apiKey");
        setHasApiKey(!!apiKeySetting?.value);

        // Load existing text regions and analyses
        const existingRegions = await db.textRegions
          .where("pageId")
          .equals(page.id)
          .toArray();
        if (existingRegions.length > 0) {
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
        }
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
    setHoveredRegion(null);
    setToggledRegions(new Set());
    setTooltipPos(null);
  }, [pageNum]);

  const handleScan = useCallback(async () => {
    if (!pageId) return;
    setScanning(true);
    setError(null);

    try {
      const apiKeySetting = await db.settings.get("apiKey");
      if (!apiKeySetting?.value) {
        setError("No API key configured. Go to Settings to add one.");
        setScanning(false);
        return;
      }

      const page = await db.pages.get(pageId);
      if (!page) {
        setError("Page not found");
        setScanning(false);
        return;
      }

      const result = await scanPage(apiKeySetting.value, page.imageBlob);

      // Clear old regions and analyses for this page
      const oldRegions = await db.textRegions
        .where("pageId")
        .equals(pageId)
        .toArray();
      const oldRegionIds = oldRegions.map((r) => r.id);
      if (oldRegionIds.length > 0) {
        await db.analyses.where("textRegionId").anyOf(oldRegionIds).delete();
        await db.textRegions.where("pageId").equals(pageId).delete();
      }

      // Store new regions
      const regionIds = await db.textRegions.bulkAdd(
        result.regions.map((r) => ({
          pageId,
          type: r.type,
          text: r.text,
          bbox: r.bbox,
        })),
        { allKeys: true },
      );

      // Update page with visual context and scanned flag
      await db.pages.update(pageId, {
        visualContext: result.visualContext,
        scanned: true,
      });
      setScanned(true);

      // Load the newly created regions
      const newRegions = await Promise.all(
        (regionIds as number[]).map(async (id) => {
          const region = (await db.textRegions.get(id))!;
          return { region, analysis: undefined } as RegionWithAnalysis;
        }),
      );
      setRegions(newRegions);
      setToggledRegions(new Set());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Scan failed: ${msg}`);
      setError(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  }, [pageId]);

  const handleAnalyze = useCallback(async () => {
    if (!pageId || regions.length === 0) return;
    setAnalyzing(true);
    setError(null);

    try {
      const apiKeySetting = await db.settings.get("apiKey");
      if (!apiKeySetting?.value) {
        setError("No API key configured. Go to Settings to add one.");
        setAnalyzing(false);
        return;
      }

      const page = await db.pages.get(pageId);
      if (!page?.visualContext) {
        setError("Page has not been scanned yet. Scan first.");
        setAnalyzing(false);
        return;
      }

      const updatedRegions = [...regions];
      for (let i = 0; i < updatedRegions.length; i++) {
        const rwa = updatedRegions[i]!;
        if (rwa.analysis) continue; // Skip already analyzed

        setAnalyzeProgress(
          `Analyzing region ${i + 1}/${updatedRegions.length}...`,
        );

        const result = await analyzeTextRegion(
          apiKeySetting.value,
          rwa.region.text,
          rwa.region.type,
          page.visualContext,
        );

        const analysisId = await db.analyses.add({
          textRegionId: rwa.region.id,
          vocabulary: result.vocabulary,
          grammar: result.grammar,
          suggestedTranslation: result.suggestedTranslation,
          rawResponse: result.rawResponse,
        });

        const analysis = await db.analyses.get(analysisId);
        updatedRegions[i] = { ...rwa, analysis: analysis! };
        setRegions([...updatedRegions]);
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

  function toggleRegion(regionId: number) {
    setToggledRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  }

  function handleRegionMouseEnter(
    regionId: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) {
    setHoveredRegion(regionId);
    updateTooltipPosition(e);
  }

  function updateTooltipPosition(e: React.MouseEvent<HTMLDivElement>) {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  const allAnalyzed =
    regions.length > 0 && regions.every((r) => r.analysis !== undefined);
  const someAnalyzed = regions.some((r) => r.analysis !== undefined);

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

  const hoveredRwa = regions.find((r) => r.region.id === hoveredRegion);

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
      <div className="mb-3 flex items-center gap-2" data-testid="scan-controls">
        <button
          onClick={handleScan}
          disabled={!hasApiKey || scanning || analyzing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          data-testid="scan-page-btn"
        >
          {scanning ? "Scanning..." : scanned ? "Re-scan Page" : "Scan Page"}
        </button>
        {regions.length > 0 && !allAnalyzed && (
          <button
            onClick={handleAnalyze}
            disabled={!hasApiKey || analyzing || scanning}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            data-testid="analyze-btn"
          >
            {analyzing ? analyzeProgress || "Analyzing..." : "Analyze All"}
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
      {!hasApiKey && (
        <div
          className="mb-3 w-full max-w-2xl rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700"
          data-testid="no-api-key-info"
        >
          Add your Claude API key in{" "}
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
        ref={imageContainerRef}
        className="relative flex w-full max-w-2xl items-center justify-center rounded bg-gray-100"
        data-testid="page-container"
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={`${title} page ${pageNum}`}
              className="max-h-[80vh] w-auto rounded"
              data-testid="page-image"
            />
            {/* Text region overlays */}
            {regions.map(({ region, analysis }) => {
              const [x, y, w, h] = region.bbox;
              const isToggled = toggledRegions.has(region.id);
              const hasAnalysis = !!analysis;
              const borderColor = hasAnalysis
                ? "border-green-400"
                : "border-yellow-400";

              return (
                <div
                  key={region.id}
                  className={`absolute cursor-pointer border-2 ${borderColor} transition-colors hover:bg-black/10`}
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    width: `${w * 100}%`,
                    height: `${h * 100}%`,
                  }}
                  data-testid={`text-region-${region.id}`}
                  onClick={() => toggleRegion(region.id)}
                  onMouseEnter={(e) => handleRegionMouseEnter(region.id, e)}
                  onMouseMove={updateTooltipPosition}
                  onMouseLeave={() => setHoveredRegion(null)}
                >
                  {/* Show translation text when toggled */}
                  {isToggled && analysis && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white/90 p-1">
                      <span className="text-center text-xs leading-tight text-gray-800">
                        {analysis.suggestedTranslation}
                      </span>
                    </div>
                  )}
                  {/* Show original text when toggled but no analysis */}
                  {isToggled && !analysis && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white/90 p-1">
                      <span className="text-center text-xs leading-tight text-gray-800">
                        {region.text}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Hover tooltip */}
            {hoveredRegion !== null && hoveredRwa?.analysis && tooltipPos && (
              <div
                className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
                style={{
                  left: `${tooltipPos.x + 12}px`,
                  top: `${tooltipPos.y + 12}px`,
                }}
                data-testid="region-tooltip"
              >
                <p className="mb-1 text-sm font-bold text-gray-900">
                  {hoveredRwa.region.text}
                </p>

                {/* Vocabulary */}
                {hoveredRwa.analysis.vocabulary.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-blue-600">
                      Vocabulary
                    </p>
                    <ul className="space-y-0.5">
                      {hoveredRwa.analysis.vocabulary.map((v, i) => (
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
                {hoveredRwa.analysis.grammar.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-purple-600">
                      Grammar
                    </p>
                    <ul className="space-y-0.5">
                      {hoveredRwa.analysis.grammar.map((g, i) => (
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
          </>
        ) : (
          <div className="p-12 text-gray-400">Loading page...</div>
        )}
      </div>

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
