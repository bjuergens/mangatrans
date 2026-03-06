// LibraryPage — the main entry screen showing imported manga.
// Will contain: CBZ file import (via JSZip), list of imported comics,
// ability to trigger AI analysis, and navigation to the reader view.

export default function LibraryPage() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Library</h1>
      <p className="mb-4 text-gray-600">
        Your manga library. Import a CBZ file to get started.
      </p>

      {/* CBZ import: will use JSZip to extract pages, store in IndexedDB via db.ts */}
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
        <p className="text-gray-400">Drop a CBZ file here or click to browse</p>
      </div>
    </div>
  );
}
