import { Routes, Route, Link } from "react-router-dom";
import LibraryPage from "./LibraryPage";
import ReaderPage from "./ReaderPage";
import SettingsPage from "./SettingsPage";

export default function App() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <nav className="flex items-center gap-4 border-b px-4 py-2">
        <Link to="/" className="text-lg font-bold">
          MangaTrans
        </Link>
        <Link to="/" className="text-sm hover:underline">
          Library
        </Link>
        <Link to="/settings" className="text-sm hover:underline">
          Settings
        </Link>
      </nav>

      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/reader/:comicId/:pageNumber" element={<ReaderPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}
