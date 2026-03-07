import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "./db";
import { Logger } from "./logger";

const log = new Logger("ReaderPage");

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
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

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

        objectUrl = URL.createObjectURL(page.imageBlob);
        setImageUrl(objectUrl);
      } catch (e) {
        log.error(`Failed to load page: ${e}`);
        setError("Failed to load page");
      }
    })();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [comicIdNum, pageNum]);

  function goToPage(n: number) {
    navigate(`/reader/${comicIdNum}/${n}`);
  }

  if (error) {
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

      {/* Page image */}
      <div className="relative flex w-full max-w-2xl items-center justify-center rounded bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${title} page ${pageNum}`}
            className="max-h-[80vh] w-auto rounded"
            data-testid="page-image"
          />
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
