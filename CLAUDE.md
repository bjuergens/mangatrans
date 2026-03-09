# CLAUDE.md

## Project

MangaTrans — a PWA for learning Japanese by translating manga. See `vision.md` for product vision and technical strategy.

## Commands

```bash
# Setup (install deps + Playwright)
npm run setup            # npm ci + install Playwright chromium

# Individual checks
npm run check:typecheck  # tsc --noEmit
npm run check:lint       # ESLint
npm run check:format     # Prettier (check only)
npm run check:test       # Vitest unit tests (single run)
npm run check:build      # Production build
npm run check:test:e2e   # Playwright E2E tests

# All checks
npm run check:all        # Runs all checks in sequence

# Other
npm run build            # Production build
npm run format           # Prettier (write)
```

## Development Workflow

### Starting a new task

Always begin by setting up and running all checks:

```bash
npm run setup
npm run check:all
```

### Implement the feature

Write code. Keep it simple.

### Before pushing

Run all checks again and make sure everything passes:

```bash
npm run check:all
```

Verify: new tests pass, existing tests still pass, no new lint errors, types check.

## Design Philosophy

- **🎯 Lean and fail fast.** Start with the simplest thing that works. Add abstraction only when you have concrete evidence it's needed, not because "it might be useful later."
- **🚫 No cargo cult.** Don't add patterns, layers, or indirection just because "that's how it's done." Every file, class, and function should earn its existence. If you can't explain why a piece of code is there without saying "best practice," delete it.
- **📏 Big functions are fine.** A 100-line function that does one clear thing is better than 10 tiny functions that require jumping around to understand the flow. Extract only when there is actual reuse or the function is genuinely doing unrelated things.
- **⏳ No premature optimization.** Don't optimize until you've measured. Don't memoize until you've profiled. Don't cache until you've seen a real latency problem.
- **🧱 No premature abstraction.** Three copy-pasted blocks are better than a wrong abstraction. Wait until you see the real pattern before extracting.
- **🔊 Fail loudly.** Throw errors, don't swallow them. Log failures clearly. If something is wrong, the developer should know immediately, not discover it later through subtle misbehavior.
- **📦 Minimal dependencies.** Every npm package is a liability. Prefer browser APIs and small focused libraries over large frameworks. Justify each dependency.

## Emoji Guide

Use emoji in commit messages, log output, and code comments for visual scanning. Be consistent. When introducing a new emoji for a new concept, add it to this table.

| Emoji | Meaning                            |
| ----- | ---------------------------------- |
| ✅    | Test pass / success                |
| ❌    | Test fail / error                  |
| 🔨    | Build / tooling                    |
| 🧪    | Testing                            |
| 📦    | Dependencies / imports / packaging |
| 🎨    | UI / styling                       |
| 📖    | Documentation                      |
| 🐛    | Bug fix                            |
| ✨    | New feature                        |
| ♻️    | Refactor                           |
| 🔍    | Search / analysis / extraction     |
| 📝    | Grammar / text / content           |
| 🗑️    | Removal / cleanup                  |
| 🚀    | Deploy / release                   |
| ⚙️    | Config / settings                  |
| 🌐    | Network / API / online             |
| 💾    | Storage / persistence              |
| 🎯    | Core goal / MVP                    |
| 📤    | Outgoing request                   |
| 📥    | Incoming response                  |

## Code Style

- TypeScript strict mode.
- Prefer `const` over `let`. Never `var`.
- Name things clearly. If a name needs a comment to explain it, rename it.
- No dead code. No commented-out code. No TODO comments without a linked issue.
- Error messages should include enough context to debug without a debugger.
- **Async: Promises only.** All async code uses `async`/`await`. No event emitters, no observables, no polling, no callback patterns. If a library uses a different paradigm, wrap it in a Promise at the integration boundary.

## File Structure

Keep it flat until it hurts. Don't create `utils/`, `helpers/`, `common/`, or `shared/` directories preemptively. When the `src/` directory genuinely gets hard to navigate, reorganize then.

## Testing

- Unit tests live next to the code: `foo.ts` → `foo.test.ts`.
- E2E tests live in `e2e/`.
- E2E tests capture browser console output to text files for debugging.
- Tests should not require network or API keys. Mock external calls.

## External API Clients

All external API integrations (Anthropic, OCR.space, future providers) follow the same structure. See `claude-api.ts` and `ocr-space-api.ts` as reference implementations.

**Class structure:**

- One class per provider (e.g. `AnthropicClient`, `OcrSpaceClient`).
- API clients are singletons — one instance per provider, exported as `export const anthropic = new AnthropicClient()`. This works because they're stateless wrappers around an external service (all state lives in IndexedDB). Don't default to singletons elsewhere — classes like `Logger` that need per-use configuration should export the constructor.
- Private `getApiKey()` method reads from `db.settings`. Throws if not configured.
- Private `request()` method — single point for all HTTP calls. Handles logging, error formatting.
- Public methods for each API operation (`detectRegions`, `ocrPage`, `testApiKey`, etc.).

**Logging:**

- Use `Logger` from `logger.ts`. Instantiate with a context string: `new Logger("ReaderPage")`, `new Logger("AnthropicClient")`.
- In API client classes, use an instance field: `private log = new Logger("ClassName")`.
- Use emoji prefixes consistently: `🌐` request start, `📤` request detail, `✅` success, `❌` error, `📥` response, `🔍` result summary.
- Censor API keys in logs (show prefix + last 4 chars).
- Truncate long response bodies in debug output.

**API keys & settings:**

- All API keys stored in IndexedDB via `db.settings`, never hardcoded.
- `testApiKey()` reads the saved key from DB (no parameters) — keeps the interface consistent.
- Provider-specific settings (engine, language, model) also stored in `db.settings`.
- API calls happen only when the user explicitly triggers an action.

**Shared utilities:**

- Image helpers (`blobToBase64`, `blobToDataUri`, `getImageDimensions`, `mediaType`, `cropImage`) live in `image-utils.ts`. Don't duplicate these in API client files.

## Git

- Commit messages: short summary line, blank line, body if needed. Use emoji prefix.
- Don't commit `logs/`, `node_modules/`, `dist/`, or `.env` files.

## CI

PR checks run: typecheck → lint → unit tests → E2E tests. All must pass.
