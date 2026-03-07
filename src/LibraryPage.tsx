import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { db, seedExampleManga, type Comic } from "./db";
import { Logger } from "./logger";

const log = new Logger("LibraryPage");

export default function LibraryPage() {
  const [comics, setComics] = useState<Comic[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  async function loadComics() {
    const allComics = await db.comics.orderBy("importedAt").reverse().toArray();
    setComics(allComics);

    // Create object URLs for cover images
    const urls: Record<number, string> = {};
    for (const comic of allComics) {
      if (comic.coverImage) {
        urls[comic.id] = URL.createObjectURL(comic.coverImage);
      }
    }
    setCoverUrls(urls);
  }

  useEffect(() => {
    (async () => {
      try {
        await seedExampleManga();
        await loadComics();
      } catch (e) {
        log.error(`Failed to load library: ${e}`);
        setError("Failed to load library");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      // Clean up object URLs
      Object.values(coverUrls).forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCbzImport(file: File) {
    setImporting(true);
    setError(null);
    try {
      const zip = await JSZip.loadAsync(file);

      // Get image files sorted by name
      const imageFiles = Object.entries(zip.files)
        .filter(
          ([name, entry]) =>
            !entry.dir && /\.(jpe?g|png|webp|gif)$/i.test(name),
        )
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

      if (imageFiles.length === 0) {
        setError("No images found in the CBZ file");
        return;
      }

      // Extract first page as cover
      const firstBlob = await imageFiles[0]![1].async("blob");

      const title = file.name.replace(/\.cbz$/i, "");
      const comicId = await db.comics.add({
        title,
        pageCount: imageFiles.length,
        coverImage: firstBlob,
        importedAt: new Date(),
      });

      // Extract all pages
      const pageEntries = await Promise.all(
        imageFiles.map(async ([, entry], i) => ({
          comicId,
          pageNumber: i + 1,
          imageBlob: await entry.async("blob"),
        })),
      );
      await db.pages.bulkAdd(pageEntries);

      log.info(`Imported "${title}" with ${imageFiles.length} pages`);
      await loadComics();
    } catch (e) {
      log.error(`CBZ import failed: ${e}`);
      setError(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleCbzImport(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleCbzImport(file);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-gray-400">Loading library...</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <Link
          to="/settings"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Settings"
          data-testid="settings-link"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          data-testid="library-error"
        >
          {error}
        </div>
      )}

      {/* Comic grid */}
      {comics.length > 0 && (
        <div
          className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          data-testid="comic-grid"
        >
          {comics.map((comic) => (
            <button
              key={comic.id}
              onClick={() => navigate(`/reader/${comic.id}/1`)}
              className="group overflow-hidden rounded-lg border border-gray-200 text-left transition-shadow hover:shadow-lg"
              data-testid={`comic-card-${comic.id}`}
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-gray-100">
                {coverUrls[comic.id] ? (
                  <img
                    src={coverUrls[comic.id]}
                    alt={comic.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    No cover
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-sm font-medium">{comic.title}</p>
                <p className="text-xs text-gray-500">
                  {comic.pageCount} page{comic.pageCount !== 1 ? "s" : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Upload area */}
      <div
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          importing
            ? "border-blue-300 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        data-testid="upload-area"
      >
        {importing ? (
          <p className="text-blue-600">Importing...</p>
        ) : (
          <>
            <p className="mb-2 text-gray-500">
              Drop a CBZ file here or click to browse
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
              data-testid="upload-button"
            >
              Add Manga
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".cbz"
              onChange={handleFileChange}
              className="hidden"
              data-testid="file-input"
            />
          </>
        )}
      </div>
    </div>
  );
}
