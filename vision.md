# MangaTrans - Vision

## What Is This?

A progressive web app that helps Japanese language learners practice translation using real manga and comics. The user imports a comic (CBZ or similar), and the app walks them through every panel — extracting text, breaking down grammar, explaining vocabulary, and surfacing nuances — so they can learn by doing the work of translation themselves.

## Who Is It For?

People who know some Japanese (roughly A1–A2 level) and want to improve by translating manga they enjoy. They can read hiragana and katakana, know basic grammar patterns, and have a small vocabulary, but need substantial help with kanji, compound expressions, slang, and context-dependent meaning.

## Core Workflow

1. **Import** — User loads a CBZ (or similar archive) into the app. Pages are extracted and stored locally in the browser.
2. **Browse** — User navigates pages and panels of their comic.
3. **Extract** — The app identifies text regions (speech bubbles, narration boxes, sound effects) on each page.
4. **Analyze** — For each text region, the app provides:
   - Raw extracted text (OCR if needed)
   - Sentence segmentation
   - Word-by-word breakdown (reading, dictionary form, part of speech)
   - Grammar pattern identification and explanation
   - Vocabulary definitions with common usage notes
   - Contextual nuance — how meaning shifts given the scene, character, tone, or story so far
5. **Translate** — The user writes their own translation attempt. The app can offer a reference translation and highlight differences or missed nuances.
6. **Review** — Vocabulary and grammar encountered can be reviewed across the whole comic.

## Design Principles

- **Learner-first** — Every feature should help the user understand *why* a sentence means what it means, not just *what* it means.
- **Offline-capable** — Once AI analysis is generated, everything works offline. Users only need connectivity for the initial analysis step.
- **No server, no account** — The app runs entirely in the browser. Users bring their own API key for AI analysis. No data leaves the device except API calls the user explicitly triggers.
- **Progressive detail** — Show a clean, readable interface by default. Let the user drill into grammar, context, and nuance on demand.
- **Works everywhere** — Desktop, tablet, and phone. Manga reading is a mobile activity; the app must feel natural on a phone screen.

## What Success Looks Like

A user opens a manga chapter, taps through panels, and for each speech bubble can see exactly what every word means, what grammar is at work, and how context changes the interpretation. They write their own translation, compare it to a reference, and over the course of a volume notice that they need the help less and less.

## Scope Boundaries

Things this app is **not** trying to be:

- A general-purpose Japanese dictionary or flashcard app (though it surfaces vocab)
- A manga reader for casual reading (the focus is on the translation workflow)
- A machine translation service (the AI assists the learner, it does not replace them)
- A social platform (no sharing, no accounts, no community features)

## Language Pairs

Primary and initial focus: **Japanese to English**.

The architecture should not make other language pairs impossible, but there is no plan to actively support them in the near term.

---

# Technical Strategy

## Constraints

- **No backend** — The app is a static PWA. There is no server to deploy or maintain.
- **No authentication** — No user accounts. All data lives in the browser.
- **User-provided API key** — The user enters their own API key (stored locally) to make AI calls directly from the browser.
- **Offline after analysis** — Network is only needed when calling the AI API. All imported manga, extracted text, and analysis results are persisted locally so the user can study offline.

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | Type safety across the whole app; good tooling. |
| Framework | **React** (via Vite) | Large ecosystem, good PWA tooling, widely understood. |
| PWA | **Vite PWA plugin** (vite-plugin-pwa / Workbox) | Generates service worker, handles caching and offline support with minimal config. |
| Styling | **Tailwind CSS** | Utility-first, responsive out of the box, small bundle with purging. |
| Local storage | **IndexedDB** via **Dexie.js** | IndexedDB can store large blobs (manga pages as images). Dexie provides a clean Promise-based API over the raw IndexedDB interface. |
| CBZ handling | **JSZip** | CBZ files are ZIP archives of images. JSZip can unzip them in the browser. |
| Image viewing | **Canvas / native `<img>`** | Pages are displayed as images. For region selection (text boxes), an overlay canvas or SVG layer on top of the page image. |
| AI API | **Anthropic Claude API** (direct fetch) | Vision capability for analyzing manga pages (OCR, panel detection, text extraction). Text capability for grammar/vocab analysis. Called directly from the browser using the user's API key. |
| State management | **Zustand** or React context | Lightweight; no boilerplate. Zustand if state grows complex, plain context if it stays simple. |
| Routing | **React Router** | Standard client-side routing for the different views (library, reader, analysis). |

## Data Model (High Level)

All data is stored in IndexedDB.

- **Comic** — metadata (title, page count, import date)
- **Page** — belongs to a Comic; stores the image blob and page number
- **TextRegion** — belongs to a Page; stores bounding box coordinates, extracted text, region type (bubble, narration, sfx)
- **Analysis** — belongs to a TextRegion; stores the full AI analysis result (grammar breakdown, vocab, nuance, reference translation, contextual notes)
- **UserTranslation** — belongs to a TextRegion; the user's own translation attempt
- **Settings** — API key, display preferences

## AI Analysis Strategy

Analysis happens in stages, each stored separately so partial progress is preserved and the user is not re-charged for repeated API calls:

1. **Page scan** (vision) — Send the page image to Claude. Identify text regions and their bounding boxes. Extract raw Japanese text via OCR. Classify regions (dialogue, narration, sound effect).
2. **Text analysis** (text) — For each extracted text region, ask Claude to provide: sentence segmentation, morphological breakdown, grammar patterns, vocabulary definitions, and nuance notes.
3. **Contextual analysis** (text) — Once multiple pages are analyzed, a follow-up pass can incorporate story context (who is speaking, what happened previously) to refine nuance explanations.

Each stage's results are cached in IndexedDB. If the user re-opens a page, the stored analysis is shown instantly with no API call.

## Offline Strategy

- **Service worker** caches the app shell (HTML, JS, CSS, assets) on first visit.
- **IndexedDB** holds all user data (comics, pages, analysis results).
- On app load, the service worker serves the shell from cache. The app reads data from IndexedDB.
- AI API calls are the only network-dependent operation. The UI clearly indicates which pages/regions have been analyzed and which still need an API call.
- If the user is offline and tries to trigger analysis, the app shows a clear message rather than failing silently.

## Responsive Design

- **Phone** — Single-column layout. Page image fills the screen; text regions are tappable overlays. Analysis appears as a bottom sheet.
- **Tablet** — Page image on one side, analysis panel on the other (split view).
- **Desktop** — Similar to tablet but with more room for side-by-side comparison and keyboard shortcuts.

The reader component adapts based on viewport width. Tailwind breakpoints handle the layout shifts.

## Build and Deployment

- **Vite** for dev server and production build.
- Output is static files (HTML + JS + CSS + service worker).
- Can be deployed to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages) or run from `file://` via the service worker.
- No CI/CD required initially — deploy is just pushing static files.

## What We Are Not Building Yet

These are future considerations, not current scope:

- Furigana rendering on extracted text
- Anki/SRS export of encountered vocabulary
- Panel-by-panel navigation (vs. full-page view)
- Multiple manga format support beyond CBZ (PDF, EPUB, raw images)
- Collaborative translation or sharing features
- Custom prompt tuning for the AI analysis
