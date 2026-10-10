# Calem Backend Plan

Calem will be cloud-connected. Cloud specs not designed yet: **cloud sync**, **membership**, **accounts**, **authentication**.

## Layers
### 1. `src/config/` (code constants)
The constants package is the single source: `engine.ts` (view/render/timing/limits), `tools.ts` (tool catalogue, width tables, TOOL_META labels), `paper.ts` (paper/page defaults), `palettes.ts` (preset sets, caps), `ui.ts` (slider ranges), `files.ts` (file names, accept filters, SW path). Behaviour changes are made here, and `tests/config.test.ts` locks them down.

### 2. IndexedDB (the local source of truth)
No cookies/localStorage, and there never will be — a cookie is 4KB and travels on every HTTP request; the wrong tool for megabytes of strokes plus image/PDF bytes. IndexedDB is the single store: the `docs` store (drawing + settings), the `files` store (PDF/image bytes). The settings schema is versioned (v1→v4); new fields migrate as optional with presence-checks, without inflating the version.

### 3. Backend seed (account/auth/sync/membership seams — pure rules in code, no network)
- **Auth seam:** `AuthProvider` interface (`getUser/signIn/signOut/onAuthChange`), default `LocalAuthProvider` (a single anonymous local user). Real auth plugs in later with the same signature: email+password and OAuth (Google) as separate providers, with local staying as the third provider. No login screen — just the seam plus the anonymous flow.
- **User-scoped storage:** the IDB adapter sits behind the `DocStorage` interface (`idbStorage`, swapped via `setStorage`). Once accounts arrive: a per-user key namespace plus `ownerId` on documents; backward-compatible migration (existing data stays in the anonymous local namespace).
- **Sync engine:** offline-first outbox pattern; the document carries `{v, savedAt}`. Conflict rule: page-level last-write-wins (merged by page `updatedAt`). Deleted pages sync as tombstones. Content-addressed file bytes (uploaded when missing).
- **Membership:** `MembershipTier` (free/pro), quota gates as pure functions (`canAddPage`, `storageQuotaBytes`) with placeholder constants in `config/membership.ts`; quota numbers will be decided last. There is no local feature lock — membership only unlocks the cloud (sync/quota/sharing); the tier is a badge, not a gate. No billing code.
- **Anonymous→account migration:** after login a "move local data into your account?" modal, defaulting to YES, one click. No automatic merge; a `.calem` import is never uploaded automatically.

## Cloud cost realities (verified: 2026-10, supabase.com/docs + /pricing)

Supabase FREE ceilings are **per project, not per user**:

| Resource | Free | Pro ($25/mo) |
|---|---|---|
| DB size | 500 MB (locked read-only when exceeded) | 8 GB included |
| File storage | 1 GB | 100 GB included |
| Egress | 5 GB + 5 GB cache /mo | 250 GB included |
| Auth MAU | 50,000 | 100,000 included |
| Projects | 2 active | no pausing |

- **7 days without activity → the project is paused** (a warning email arrives; resume from the dashboard within a year, cold start 10-30s). A few daily queries keep it alive, but a real user would still see "my sync isn't working".
- **There are NO automatic backups on Free** — `.calem` export doubles as the backup and stays visible.
- Quota math: free 25MB × 40 users = the 1GB ceiling. As the ceiling approaches, either free sign-ups stop or we move to Pro.

Decisions:
- Sync ships on day one labelled **"beta"**; `.calem` export stays in the menu as a backup.
- PDF background bytes stay out of sync (re-imported locally); only vector ink + small images sync — this protects storage/egress.
- The first fixed cost: Supabase Pro at ~$25/mo. It has to be covered before the first revenue.
- Distribution moves (even before billing exists): NO waiting-list button — the decision is to build the infrastructure seam first. Open the MoR account (Polar/Lemon Squeezy ~5% + $0.50 — roughly 10% effective on a small basket, verify) early so KYC/approval is already done. Promise early users a **founder badge + 50% lifetime discount** (`FOUNDER_DISCOUNT_PCT`, `CalemUser.founder`) — this avoids the "I got trapped" feeling when the paid tier arrives.

## Phases
- **Phase 1 — the `src/config/` package:** constant migration + lock tests (done).
- **Phase 2 — storage interface:** `DocStorage` + IDB adapter (done).
- **Phase 3 — UI duplication:** slider bounds, TOOL_META, file names (done).
- **Phase 4 — backend seeds:** auth + user-scoped storage + sync rules + membership (done, no network).
  - `src/lib/auth.ts`: `AuthProvider` + `LocalAuthProvider` (a single anonymous local user), `getAuth/setAuthProvider` binding.
  - `src/lib/idb.ts`: `PersistedDocV5.ownerId?` (falls back to `local-anon`, no migration), `docOwner`, `namespaceFor`, `namespacedStorage` (docs+settings prefixed, content-addressed files global).
  - `src/lib/sync.ts`: pure rules — `mergePages` (page LWW, local wins ties), `mergeTombstones`, `applyTombstones`, `mergeDocuments`, outbox (`enqueueOp/ackOps/pendingFileIds`, cap 200), `contentKey` (FNV-1a), `missingFileIds`, `isRemoteNewer`.
  - `src/config/membership.ts`: `MembershipTier` (free/pro), placeholder quotas, `canAddPage`/`storageQuotaBytes` (not called locally, no locking), `canUseCloud`.
  - Tests: `tests/auth|storage|sync|membership.test.ts` (29 tests; 80/80 overall at that time).
  - Not done: network transport, login screen, anonymous→account migration modal, billing — all after accounts exist.
- **Phase 5 — billing infrastructure seam:** (done, no network, no waiting-list UI).
  - `src/lib/billing.ts`: `BillingProvider` (`getStatus/checkout/openPortal/onBillingChange`) + `NoopBillingProvider` (checkout/portal explicitly refuse), `getBilling/setBillingProvider` binding.
  - `src/config/membership.ts`: `FOUNDER_DISCOUNT_PCT` (50%) + `applyDiscount` (rounds down); `CalemUser.founder?` flag.
  - Tests: `tests/billing.test.ts` + founder discount locks.

## Deliberately out of scope
- Moving to cookies/localStorage, backend code, user accounts (this plan only has their seams).
- No behaviour change — pure migration + tests.
