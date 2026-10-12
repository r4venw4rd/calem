# Architecture

Calem is a single-page offline-first PWA: Vue 3 + Pinia + Canvas 2D + IndexedDB. The rule: **page-space vectors + base/overlay** — points are stored in page points, so resize/zoom never scales a point.

## Layers

```
src/config/   Constants (single source): engine, tools, paper, palettes, ui, files, membership
src/lib/      Pure logic (independent of UI/store, unit-tested): erase, select, paper, text, sync, auth, billing, idb
src/stores/   Pinia: orchestration (goal: a thin layer — see "God-file debt" below)
src/views/    CanvasView + panels
```

> **God-file debt (ongoing work):** `stores/drawing.ts` (~4K lines) and `views/CanvasView.vue`
> (~3.6K lines) have not been split yet. Target: `src/model/` (types), `src/render/` (painting),
> `src/persist/` (snapshot+IDB) — one slice per commit, zero behaviour change.

## Data Flow

```
pointer/touch → CanvasSurface (preventDefault, gesture lock)
  → store action (collect points, decimation)
  → rAF queue (one paint per frame)
  → overlay: active stroke · base: committed ink
pointerup → stopDrawing: apply to base + history snapshot + debounced IDB
```

Critical paths **never paint synchronously** (pan included). When in doubt, check `emaMs/frameMs` in the HUD.

## Seams

External services sit behind interfaces; there is no network code — the real provider plugs in with the same signature:

| Seam    | Interface                         | Default                         | Real               |
| ------- | --------------------------------- | ------------------------------- | ------------------ |
| Auth    | `AuthProvider` (`lib/auth`)       | `LocalAuthProvider` (anonymous) | email/OAuth later  |
| Storage | `DocStorage` (`lib/idb`)          | IDB adapter                     | user-namespaced    |
| Sync    | pure rules (`lib/sync`)           | outbox + page LWW               | transport later    |
| Billing | `BillingProvider` (`lib/billing`) | `NoopBillingProvider`           | Polar/Stripe later |

Adding a new tool: a type in the `Tool` union + metadata in `config/tools` + logic in `lib/` — it should land without touching the core (if it can't, that's architectural debt; open an issue).

## Migrations

- Settings: `v1 → v4` (presence-check, no version inflation).
- Document: `v2 → v5` (`PersistedDoc.v`). Rule: an old record opens as one page / one layer / blank paper, and **ink is never lost**.

Rules:

- Don't drop unknown fields; keep the `cleanStrokes`/`pageSizeOf` pattern.
- On every migration an old record opens as one page / one layer / blank paper; ink is never lost.
- `checkSavedSession` recognises the new versions.
