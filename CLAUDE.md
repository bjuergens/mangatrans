# CLAUDE.md

## Project

MangaTrans — a PWA for learning Japanese by translating manga. See `vision.md` for product vision and technical strategy.

## Commands

```bash
# Dev
npm run dev              # Start Vite dev server

# Build
npm run build            # Production build
npm run preview          # Preview production build locally

# Test
npm run test             # Vitest unit tests (watch mode)
npm run test:run         # Vitest unit tests (single run)
npm run test:e2e         # Playwright E2E tests

# Lint
npm run lint             # ESLint
npm run format           # Prettier (write)
npm run format:check     # Prettier (check only)
npm run typecheck        # tsc --noEmit
```

## Development Workflow

### Before starting a feature

Run all checks and save baseline logs:

```bash
npm run typecheck > logs/typecheck-before.log 2>&1
npm run lint > logs/lint-before.log 2>&1
npm run test:run > logs/test-before.log 2>&1
npm run test:e2e > logs/e2e-before.log 2>&1
```

### Implement the feature

Write code. Keep it simple.

### After implementing

Re-run all checks and compare:

```bash
npm run typecheck > logs/typecheck-after.log 2>&1
npm run lint > logs/lint-after.log 2>&1
npm run test:run > logs/test-after.log 2>&1
npm run test:e2e > logs/e2e-after.log 2>&1

diff logs/test-before.log logs/test-after.log
diff logs/e2e-before.log logs/e2e-after.log
```

Verify: new tests pass, existing tests still pass, no new lint errors, types check.

## Design Philosophy

- **Lean and fail fast.** Start with the simplest thing that works. Add abstraction only when you have concrete evidence it's needed, not because "it might be useful later."
- **No cargo cult.** Don't add patterns, layers, or indirection just because "that's how it's done." Every file, class, and function should earn its existence. If you can't explain why a piece of code is there without saying "best practice," delete it.
- **Big functions are fine.** A 100-line function that does one clear thing is better than 10 tiny functions that require jumping around to understand the flow. Extract only when there is actual reuse or the function is genuinely doing unrelated things.
- **No premature optimization.** Don't optimize until you've measured. Don't memoize until you've profiled. Don't cache until you've seen a real latency problem.
- **No premature abstraction.** Three copy-pasted blocks are better than a wrong abstraction. Wait until you see the real pattern before extracting.
- **Fail loudly.** Throw errors, don't swallow them. Log failures clearly. If something is wrong, the developer should know immediately, not discover it later through subtle misbehavior.
- **Minimal dependencies.** Every npm package is a liability. Prefer browser APIs and small focused libraries over large frameworks. Justify each dependency.

## Code Style

- TypeScript strict mode.
- Prefer `const` over `let`. Never `var`.
- Name things clearly. If a name needs a comment to explain it, rename it.
- No dead code. No commented-out code. No TODO comments without a linked issue.
- Error messages should include enough context to debug without a debugger.

## File Structure

Keep it flat until it hurts. Don't create `utils/`, `helpers/`, `common/`, or `shared/` directories preemptively. When the `src/` directory genuinely gets hard to navigate, reorganize then.

## Testing

- Unit tests live next to the code: `foo.ts` → `foo.test.ts`.
- E2E tests live in `e2e/`.
- E2E tests capture browser console output to text files for debugging.
- Tests should not require network or API keys. Mock external calls.

## AI API Calls

- All AI calls go through the user's own API key stored in IndexedDB.
- Never hardcode API keys or include them in source.
- API calls happen only when the user explicitly triggers analysis.

## Git

- Commit messages: short summary line, blank line, body if needed.
- Don't commit `logs/`, `node_modules/`, `dist/`, or `.env` files.

## CI

PR checks run: typecheck → lint → unit tests → E2E tests. All must pass.
