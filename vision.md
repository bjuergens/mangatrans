# MangaTrans - Vision

## What Is This?

A progressive web app that helps Japanese language learners practice translation using real manga and comics. The user imports a comic (CBZ or similar), and the app walks them through every panel — extracting text, breaking down grammar, explaining vocabulary, and surfacing nuances — so they can learn by doing the work of translation themselves.

## Who Is It For?

People who know some Japanese (roughly A1–A2 level) and want to improve by translating manga they enjoy. They can read hiragana and katakana, know basic grammar patterns, and have a small vocabulary, but need substantial help with kanji, compound expressions, slang, and context-dependent meaning.

## Core Workflow

1. **Import** — User loads a CBZ (or similar archive) into the app. Pages are extracted and stored locally in the browser.
2. **Analyze** — The user triggers AI analysis. For each page, the app extracts text regions and generates a full linguistic breakdown upfront. All results are stored locally.
3. **Study** — The user browses pages and taps on text regions to see the analysis: extracted text, vocabulary, grammar, and (where available) contextual notes. The data flow is simple: AI produces the analysis once, the user consumes it at their own pace.

## Design Principles

- **Learner-first** — Every feature should help the user understand _why_ a sentence means what it means, not just _what_ it means.
- **Offline-capable** — Once AI analysis is generated, everything works offline. Users only need connectivity for the initial analysis step.
- **No server, no account** — The app runs entirely in the browser. Users bring their own API key for AI analysis. No data leaves the device except API calls the user explicitly triggers.
- **Progressive detail** — Show a clean, readable interface by default. Let the user drill into grammar, context, and nuance on demand.
- **Works everywhere** — Desktop, tablet, and phone. Manga reading is a mobile activity; the app must feel natural on a phone screen.

## What Success Looks Like

A user opens a manga chapter, taps through panels, and for each speech bubble can see exactly what every word means, what grammar is at work, and how context changes the interpretation.

## Scope Boundaries

Things this app **does not do**:

- **Not a conversation with AI** — Analysis is generated upfront in one pass. There is no back-and-forth, no "ask a follow-up question," no iterative feedback loop. Simple data flow: AI produces, user consumes.
- **Not a translation tool** — The user does not submit translations for grading. The app shows linguistic breakdowns to help the user translate in their head.
- **Not a flashcard/SRS app** — It surfaces vocabulary in context but does not quiz the user or track spaced repetition.
- **Not a manga reader** — Reading comfort is secondary to the translation study workflow.
- **Not a social platform** — No sharing, no accounts, no community features.

## Language Pairs

Primary and initial focus: **Japanese to English**.

The architecture should not make other language pairs impossible, but there is no plan to actively support them in the near term.

## MVP

The minimum viable product focuses on the simplest useful loop: one page, one text region at a time, no cross-page awareness.

- 📦 **Import CBZ** — Unzip, store pages in IndexedDB.
- 🔍 **Text extraction** — Two options: (1) Send a page image to AI vision, get back identified text regions with extracted Japanese text. (2) Local OCR library running in the browser (no network needed). We'll evaluate which works better — may keep both as user-selectable options.
- 📖 **Vocabulary breakdown** — For each text region: word-by-word definitions, readings, dictionary forms.
- 📝 **Grammar breakdown** — For each text region: grammar patterns identified and explained.
- 🖼️ **Page viewer** — Display the manga page with tappable text region indicators. Tap a region to see its analysis.

Each text region is analyzed **in isolation**. No cross-page context, no character tracking, no story-level awareness. This keeps the AI prompts simple and the data model flat.

## Nice to Have (Post-MVP)

Ordered roughly by priority:

1. 🗺️ **Overlay UI** — View the page with toggleable overlays: romaji, literal translation, natural translation, vocab highlights, grammar highlights, cultural notes.
2. 📚 **Context-aware analysis** — Feed surrounding pages or the whole chapter to the AI for better nuance (who is speaking, tone, callbacks to earlier dialogue).
3. 🔎 **Vocabulary across manga** — Track all vocabulary encountered across the entire comic. Frequency lists. "Words you've seen before."
4. 📱 **Manga reader UX** — Zoom, pan, page turn gestures, reading direction (right-to-left), double-page spread support.
5. 📁 **More formats** — PDF, EPUB, raw image folders.
6. 🎌 **Furigana rendering** — Show readings above kanji in the extracted text.
7. 🔄 **Re-analysis with feedback** — Let the user ask follow-up questions about a specific text region or request a re-analysis with additional context.
8. 📤 **Anki export** — Export encountered vocabulary as Anki cards.

---

# Technical Strategy

## Constraints

- **No backend** — The app is a static PWA. There is no server to deploy or maintain.
- **No authentication** — No user accounts. All data lives in the browser.
- **User-provided API key** — The user enters their own API key (stored locally) to make AI calls directly from the browser.
- **Offline after analysis** — Network is only needed when calling the AI API. All imported manga, extracted text, and analysis results are persisted locally so the user can study offline.
- **Promises/async only** — All async operations use `async`/`await` and Promises. No mixing paradigms (no event emitters, no observables, no polling, no callbacks). If a library uses a different paradigm, wrap it in a Promise at the boundary.

## Stack

| Layer            | Choice                                          | Rationale                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language         | **TypeScript**                                  | Type safety across the whole app; good tooling.                                                                                                                                             |
| Framework        | **React** (via Vite)                            | Large ecosystem, good PWA tooling, widely understood. Build tool only — no dev server in workflow.                                                                                          |
| PWA              | **Vite PWA plugin** (vite-plugin-pwa / Workbox) | Generates service worker, handles caching and offline support with minimal config.                                                                                                          |
| Styling          | **Tailwind CSS**                                | Utility-first, responsive out of the box, small bundle with purging.                                                                                                                        |
| Local storage    | **IndexedDB** via **Dexie.js**                  | IndexedDB can store large blobs (manga pages as images). Dexie provides a clean Promise-based API over the raw IndexedDB interface.                                                         |
| CBZ handling     | **JSZip**                                       | CBZ files are ZIP archives of images. JSZip can unzip them in the browser.                                                                                                                  |
| Image viewing    | **Canvas / native `<img>`**                     | Pages are displayed as images. For region selection (text boxes), an overlay canvas or SVG layer on top of the page image.                                                                  |
| AI API           | **Anthropic Claude API** (direct fetch)         | Vision capability for analyzing manga pages (OCR, panel detection, text extraction). Text capability for grammar/vocab analysis. Called directly from the browser using the user's API key. |
| State management | **Zustand** or React context                    | Lightweight; no boilerplate. Zustand if state grows complex, plain context if it stays simple.                                                                                              |
| Routing          | **React Router**                                | Standard client-side routing for the different views (library, reader, analysis).                                                                                                           |
| Unit tests       | **Vitest**                                      | Same config as Vite, fast, native ESM and TypeScript support.                                                                                                                               |
| E2E tests        | **Playwright**                                  | Cross-browser, good PWA/service worker support, captures console logs.                                                                                                                      |
| Linting          | **ESLint** + **Prettier**                       | Standard TS/React linting and formatting.                                                                                                                                                   |

## Data Model (High Level)

All data is stored in IndexedDB. Simple and flat for MVP.

- **Comic** — metadata (title, page count, import date)
- **Page** — belongs to a Comic; stores the image blob and page number
- **TextRegion** — belongs to a Page; stores bounding box coordinates, extracted text, region type (bubble, narration, sfx)
- **Analysis** — belongs to a TextRegion; stores the full AI analysis result (vocab breakdown, grammar explanation)
- **Settings** — API key, display preferences

## AI Analysis Strategy

Analysis is **upfront and one-shot**. The user triggers it, the AI produces results, and the app stores them. No back-and-forth.

**MVP** — two stages per page, each cached in IndexedDB:

1. **Page scan** — Identify text regions and their bounding boxes, extract raw Japanese text, classify regions (dialogue, narration, sound effect). Two extraction backends: (a) AI vision (send page image to Claude) or (b) local OCR library (runs offline in browser). We'll evaluate both and may keep either or both as user-selectable options.
2. **Text analysis** (text) — For each extracted text region: word-by-word vocabulary breakdown (reading, dictionary form, part of speech, definition) and grammar pattern identification with explanations.

Each stage's results are cached in IndexedDB. If the user re-opens a page, the stored analysis is shown instantly with no API call.

**Post-MVP** — optional third stage:

3. **Contextual analysis** (text) — Feed surrounding pages to the AI for cross-page context: who is speaking, tone shifts, callbacks to earlier dialogue, cultural nuance.

## Offline Strategy

- **Service worker** caches the app shell (HTML, JS, CSS, assets) on first visit.
- **IndexedDB** holds all user data (comics, pages, analysis results).
- On app load, the service worker serves the shell from cache. The app reads data from IndexedDB.
- AI API calls are the only network-dependent operation. The UI clearly indicates which pages/regions have been analyzed and which still need an API call.
- If the user is offline and tries to trigger analysis, the app shows a clear message rather than failing silently.

## Service Worker Update Flow

When a new version is deployed, the service worker detects the update in the background. The app shows a **toast notification** telling the user a new version is available, with an **"Update" button**. Clicking the button activates the new service worker and reloads the page. The user is never force-reloaded — they choose when to update. This is supported out of the box by vite-plugin-pwa's `registerSW({ onNeedRefresh })` callback.

## Responsive Design

- **Phone** — Single-column layout. Page image fills the screen; text regions are tappable overlays. Analysis appears as a bottom sheet.
- **Tablet** — Page image on one side, analysis panel on the other (split view).
- **Desktop** — Similar to tablet but with more room for side-by-side comparison and keyboard shortcuts.

The reader component adapts based on viewport width. Tailwind breakpoints handle the layout shifts.

## Testing

- **Vitest** for unit and integration tests. Runs in the same Vite pipeline, no separate config.
- **Playwright** for end-to-end tests. E2E tests capture browser console output to text files so failures can be debugged from logs alone.
- Tests run locally and in CI. No test should require network access or an API key — mock AI responses where needed.

## CI/CD (GitHub Actions)

- **PR checks** — On every PR: lint (ESLint + Prettier), type-check (`tsc --noEmit`), unit tests (Vitest), E2E tests (Playwright). All must pass before merge. Test output and browser console logs are uploaded as artifacts.
- **Deploy** — On push to `main`: run all checks capturing output, build the app, generate a build report page at `/build`, deploy to **GitHub Pages** via the official `actions/deploy-pages` action. The root URL serves the PWA; `/build` shows a static HTML page with the output from every check step (typecheck, lint, format, unit tests, build, E2E).
- Build injects a **build timestamp** (ISO 8601) at compile time (e.g. via Vite's `define` or an env variable). This timestamp is displayed somewhere in the app UI (footer, settings, about screen) so users can see which version they're running.

## Build and Deployment

- **Vite** for production build.
- Output is static files (HTML + JS + CSS + service worker).
- Deployed to **GitHub Pages** via GitHub Actions on push to `main`.
- Development feedback loop is test-driven (unit + E2E), not dev-server-driven.
