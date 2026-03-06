// ReaderPage — displays a manga page with tappable text region overlays.
// Will contain: page image display (from IndexedDB), text region bounding boxes
// rendered as SVG/canvas overlays, and an analysis panel showing vocabulary
// and grammar breakdowns when a region is tapped.

import { useParams } from "react-router-dom";

export default function ReaderPage() {
  const { comicId, pageNumber } = useParams<{
    comicId: string;
    pageNumber: string;
  }>();

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Reader</h1>
      <p className="text-gray-600">
        Comic {comicId}, Page {pageNumber}
      </p>

      {/* Page image: will load from IndexedDB (db.pages) and display as <img> */}
      <div className="relative mt-4 flex items-center justify-center rounded bg-gray-100 p-8">
        <p className="text-gray-400">Manga page will render here</p>

        {/* Text region overlays: positioned absolutely over the page image,
            clickable to show analysis panel with vocab/grammar breakdown */}
      </div>

      {/* Analysis panel: shown when a text region is tapped.
          Displays VocabEntry[] and GrammarPoint[] from db.analyses */}
    </div>
  );
}
