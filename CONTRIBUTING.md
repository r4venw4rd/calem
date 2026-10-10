# Contributing Guide

Welcome to Calem. An offline-first, zero-latency drawing app — speed and simplicity come before everything else.

## Quick Start

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest, everything must be green
npm run type-check # required before a PR
npm run test:e2e   # Playwright against the system Chrome (starts its own dev server)
```

## Rules

1. **Never break tests for free:** `npm test` (117 tests) and `npm run type-check` are green on every commit.
2. **New logic = new test:** pure functions (`src/lib/`) come with a unit test in `tests/`. UI behaviour is added as a row in the manual checklist in `TEST.md`.
3. **Config is the single source of truth:** if a limit, constant or UI range changes, touch `src/config/`; `tests/config.test.ts` locks it down.
4. **Small PRs:** one PR, one job. Before adding to a god file (`stores/drawing.ts`, `views/CanvasView.vue`) read `ARCHITECTURE.md` — find out where your change belongs.
5. **Performance:** never add synchronous painting to the draw path (`pointermove` → paint); keep the rAF pattern. When in doubt, check `emaMs/frameMs` in the HUD.

## Branch + Commit

- Branch: `feature/short-name`, `fix/short-name`
- Commit: `type(scope): short description` — e.g. `fix(eraser): ...`, `feat(pan): ...`, `perf(draw): ...`, `test: ...`, `docs: ...`

## PR Checklist

- [ ] `npm test` green
- [ ] `npm run type-check` clean
- [ ] Touch the canvas/erase/undo path? `npm run test:e2e` green too
- [ ] New logic tested / manual checklist updated
- [ ] No synchronous painting on a millisecond-critical path

Something wrong? Open an issue — device + browser + a step-by-step reproduction is enough.
