# MangaTrans — Requirements Specification

Requirements to rebuild this project from scratch.

---

## 1. Product Summary

A browser-based PWA that helps Japanese language learners (A1–A2 level) practice translation using manga. Users import comic files, trigger AI-powered text extraction and linguistic analysis, then study the results offline at their own pace.

**Key principle:** AI produces analysis once upfront; the user consumes it. No back-and-forth conversation with AI.

---

## 2. Target User

- Knows hiragana, katakana, and basic grammar
- Small Japanese vocabulary, needs help with kanji, compound expressions, slang, context-dependent meaning
- Wants to learn by translating manga they enjoy
- May be on a phone, tablet, or desktop

---

## 3. Functional Requirements

### 3.1 Comic Import

| ID | Requirement |
|----|-------------|
| F-IMP-1 | Import CBZ files (ZIP archives of images) via file picker or drag-and-drop |
| F-IMP-2 | Extract images from CBZ and store them locally in IndexedDB |
| F-IMP-3 | Create a comic record with title (derived from filename), page count, cover image (first page), and import timestamp |
| F-IMP-4 | Bundle an example manga (e.g. Wikipe-tan) that auto-seeds on first launch if the library is empty |

### 3.2 Comic Library

| ID | Requirement |
|----|-------------|
| F-LIB-1 | Display all imported comics in a responsive grid with cover thumbnails |
| F-LIB-2 | Click a comic to open it in the reader |
| F-LIB-3 | Show drag-and-drop upload area alongside the library |

### 3.3 Page Reader & Text Region Overlays

| ID | Requirement |
|----|-------------|
| F-RDR-1 | Display a manga page image that scales to fit the viewport |
| F-RDR-2 | Navigate between pages with Previous/Next controls, respecting page bounds |
| F-RDR-3 | Render text regions as colored overlay boxes positioned over the page image using normalized coordinates (0–1 fractions) |
| F-RDR-4 | Color-code region borders by status: unscanned (orange), scanned/has text (yellow), analyzed (green), selected (blue) |
| F-RDR-5 | Click a region overlay to cycle display mode: transparent → OCR text overlay → translation overlay → transparent |

### 3.4 Text Extraction (AI Vision)

| ID | Requirement |
|----|-------------|
| F-EXT-1 | **Detect regions** — Send page image to AI vision API; receive bounding boxes, region types (dialogue/narration/sfx), text direction, furigana flags, and a visual context description |
| F-EXT-2 | **OCR regions** — For each detected region, crop the image and send to AI vision API; receive extracted Japanese text |
| F-EXT-3 | Store detected regions and extracted text in IndexedDB |
| F-EXT-4 | Show progress indicators during detection and OCR |
| F-EXT-5 | Support a single-pass alternative: one API call that detects regions AND extracts text simultaneously |
| F-EXT-6 | Allow re-detection, which clears all existing regions and analyses for the page |

### 3.5 Manual Region Editing

| ID | Requirement |
|----|-------------|
| F-EDT-1 | After detection but before OCR, allow manual adjustment of region bounding boxes (position and size) |
| F-EDT-2 | Add new regions manually |
| F-EDT-3 | Delete regions |
| F-EDT-4 | Change region type (dialogue/narration/sfx) |
| F-EDT-5 | Toggle furigana flag on a region |

### 3.6 Linguistic Analysis

| ID | Requirement |
|----|-------------|
| F-ANL-1 | For each text region, send extracted text + region type + visual context to AI text API |
| F-ANL-2 | Receive and store: vocabulary breakdown (word, reading, dictionary form, part of speech, definition), grammar patterns (pattern + explanation), and a suggested English translation |
| F-ANL-3 | Show analysis via hover tooltip on analyzed regions: vocabulary table and grammar explanations |
| F-ANL-4 | Show progress indicator during analysis |
| F-ANL-5 | Cache all analysis results in IndexedDB — revisiting a page shows stored results instantly with no API call |

### 3.7 Settings

| ID | Requirement |
|----|-------------|
| F-SET-1 | API key input: save, clear, and test (validate against API without consuming tokens) |
| F-SET-2 | Text extraction backend selector (AI Vision vs Local OCR — Local OCR may be a placeholder for future work) |
| F-SET-3 | Analysis detail level selector (Basic vs Detailed) |
| F-SET-4 | Reset app: clear all data from IndexedDB, unregister service worker, clear caches |
| F-SET-5 | Display build timestamp and project link |

### 3.8 Navigation

| ID | Requirement |
|----|-------------|
| F-NAV-1 | Top navigation bar with links to Library and Settings |
| F-NAV-2 | Routes: `/` (library), `/settings`, `/reader/:comicId/:pageNumber` |
| F-NAV-3 | Back-to-library link from reader |

---

## 4. Non-Functional Requirements

### 4.1 Architecture

| ID | Requirement |
|----|-------------|
| NF-ARC-1 | Static PWA — no backend server, no user accounts |
| NF-ARC-2 | All data stored locally in IndexedDB (comics, pages, text regions, analyses, settings) |
| NF-ARC-3 | AI API calls happen only when the user explicitly triggers them |
| NF-ARC-4 | User provides their own API key, stored in IndexedDB — never hardcoded |
| NF-ARC-5 | API key sent via `x-api-key` header with `anthropic-dangerous-direct-browser-access: true` for browser-direct calls |

### 4.2 Offline & PWA

| ID | Requirement |
|----|-------------|
| NF-PWA-1 | Service worker caches app shell for offline use |
| NF-PWA-2 | After analysis, all study features work fully offline |
| NF-PWA-3 | User-controlled update flow: toast notification when new version is available, user clicks to update |
| NF-PWA-4 | Clear offline error message if user triggers analysis without connectivity |

### 4.3 Responsive Design

| ID | Requirement |
|----|-------------|
| NF-RSP-1 | Phone: single-column, page fills screen, tappable overlays |
| NF-RSP-2 | Tablet/Desktop: more screen real estate for side-by-side layouts |
| NF-RSP-3 | Region overlays use percentage-based positioning so they scale with image size |

### 4.4 Performance

| ID | Requirement |
|----|-------------|
| NF-PRF-1 | Page images loaded from IndexedDB blobs — no network fetch for stored pages |
| NF-PRF-2 | Image cropping for OCR uses Canvas/OffscreenCanvas API |

### 4.5 Security

| ID | Requirement |
|----|-------------|
| NF-SEC-1 | No data leaves the device except explicit AI API calls |
| NF-SEC-2 | API key stored only in IndexedDB, never in source or localStorage |
| NF-SEC-3 | No hardcoded credentials |

---

## 5. Data Model

Five IndexedDB tables:

| Table | Key Fields | Relationships |
|-------|-----------|---------------|
| **Comics** | id, title, pageCount, coverImage (Blob), importedAt | — |
| **Pages** | id, comicId, pageNumber, imageBlob, visualContext?, detected?, scanned? | belongs to Comic |
| **TextRegions** | id, pageId, type (dialogue\|narration\|sfx), text, bbox [x,y,w,h] as 0–1 fractions, textDirection?, hasFurigana? | belongs to Page |
| **Analyses** | id, textRegionId, vocabulary[], grammar[], suggestedTranslation, rawResponse | belongs to TextRegion |
| **Settings** | key (primary), value | standalone |

---

## 6. AI API Requirements

### 6.1 Provider

Anthropic Claude API, called directly from the browser.

### 6.2 Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/models` | Validate API key (no tokens consumed) |
| `POST /v1/messages` (vision) | Detect text regions on a page image |
| `POST /v1/messages` (vision) | OCR individual cropped regions |
| `POST /v1/messages` (text) | Linguistic analysis of extracted text |

### 6.3 Prompt Requirements

- **Region detection prompt:** Given a manga page image, return JSON array of regions with bounding boxes, types, text direction, furigana flags, and a visual context description of the page
- **OCR prompt:** Given a cropped image of a text region, return the Japanese text
- **Analysis prompt:** Given Japanese text, region type, and visual context, return vocabulary breakdown (word, reading, dictionary form, POS, definition), grammar patterns (pattern, explanation), and suggested English translation

---

## 7. Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Language | TypeScript (strict) | Type safety |
| UI Framework | React (via Vite) | Ecosystem, PWA tooling |
| Styling | Tailwind CSS | Utility-first, responsive, small bundle |
| Local Storage | IndexedDB via Dexie.js | Stores large blobs, Promise-based API |
| Archive Handling | JSZip | Browser-side CBZ/ZIP extraction |
| PWA | vite-plugin-pwa / Workbox | Service worker generation |
| AI | Anthropic Claude API (fetch) | Vision + text capabilities |
| Routing | React Router | Client-side SPA routing |
| Unit Tests | Vitest | Same Vite pipeline |
| E2E Tests | Playwright | Cross-browser, console capture |
| Linting | ESLint + Prettier | Code quality |

---

## 8. Testing Requirements

| ID | Requirement |
|----|-------------|
| T-1 | Unit tests for database operations (CRUD on all tables) |
| T-2 | Unit tests for API client (mocked fetch, all endpoints) |
| T-3 | Unit tests for settings page (rendering, save/load, reset) |
| T-4 | E2E tests for library page (loads, shows comics, upload area) |
| T-5 | E2E tests for navigation (library ↔ settings ↔ reader) |
| T-6 | E2E tests for reader (page navigation, bounds checking) |
| T-7 | E2E tests for settings (API key save/clear/test, options) |
| T-8 | No test requires network access or a real API key — all external calls mocked |
| T-9 | E2E tests capture browser console output to files for debugging |

---

## 9. CI/CD Requirements

| ID | Requirement |
|----|-------------|
| CI-1 | PR checks run in order: typecheck → lint → unit tests → E2E tests; all must pass |
| CI-2 | Deploy to GitHub Pages on push to `main` |
| CI-3 | Build injects a timestamp (ISO 8601) displayed in the app UI |
| CI-4 | Static output only (HTML + JS + CSS + service worker) |

---

## 10. Scope Boundaries (Explicit Non-Goals)

- No conversational AI — analysis is one-shot, not a chatbot
- No translation grading — the app does not evaluate user translations
- No SRS / flashcards — vocabulary is shown in context only
- No manga reader UX polish (zoom, pan, gestures, R-to-L page turns) — study workflow comes first
- No social features, accounts, or sharing
- No server or backend infrastructure
- Language pair is Japanese → English only (architecture should not prevent others later)

---

## 11. Future Considerations (Post-MVP, Not Required for Rebuild)

These are documented for awareness but are **not** in scope for a from-scratch rebuild:

1. Overlay UI with toggleable layers (romaji, translations, highlights)
2. Cross-page context-aware analysis
3. Vocabulary tracking across a manga (frequency lists, "words seen before")
4. Manga reader UX (zoom, pan, gestures, RTL page turns, double-page spreads)
5. Additional formats (PDF, EPUB, image folders)
6. Furigana rendering above kanji
7. Re-analysis with follow-up questions
8. Anki export
