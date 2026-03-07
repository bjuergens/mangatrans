# MangaTrans

A PWA for learning Japanese by translating manga. See [vision.md](vision.md) for the full product vision.

## Live App

**Main (production):** https://bjuergens.github.io/mangatrans/

### Branch Previews

Every pull request is automatically deployed at:

```
https://bjuergens.github.io/mangatrans/branches/<branch-name>/
```

Slashes in branch names are replaced with hyphens — e.g. `feature/foo` → `feature-foo`.

The PR bot posts a direct link when a preview is ready. Previews are deleted when the PR is closed.

## Development

```bash
npm install
npm run dev
```

See [CLAUDE.md](CLAUDE.md) for the full command reference and development workflow.
