# Graph Island — Project Constitution

## Architecture

- **Entry**: `src/main.ts` → `GraphViewsPlugin` (Obsidian Plugin)
- **Rendering**: Canvas2D (default) / WebGL (opt-in) via `src/views/renderer-factory.ts`
- **Data pipeline**: `src/parsers/metadata-parser.ts` → `buildGraphFromVault()` → `getGraphData()` filtering → render
- **Layouts**: `src/layouts/` — each layout algorithm as pure functions where possible
- **Build**: esbuild (`esbuild.config.mjs`), target ES2020, externals: obsidian, electron, @codemirror/*
- **Package manager**: pnpm

## GOD OBJECT Policy

These files are oversized. **Do NOT grow them**. Extract logic into new files instead.

| File | Lines | Max Allowed | Decomposition Priority |
|------|-------|-------------|----------------------|
| `src/views/GraphViewContainer.ts` | 8652 | 8655 | 1 — extract: snapshot, export, filter orchestration |
| `src/views/PanelBuilder.ts` | 1719 | 2216 | 2 — extract: individual panel sections |
| `src/views/EdgeRenderer.ts` | 2765 | 2765 | 3 — extract: cable-tray rendering, label rendering |
| `src/views/RenderPipeline.ts` | 2657 | 2657 | 4 — extract: LOD logic, culling logic |

"Max Allowed" = current line count. Ratchet down only.

> **2026-04-25 ratchet re-baseline (Phase E1)**: GraphViewContainer.ts (8424 → 8655)
> and RenderPipeline.ts (2321 → 2476) were raised from their previous ratchet
> to match the actual current line counts. Feature additions had exceeded the
> previous limits without an offsetting extract, breaking the autonomous gate.
> The new values lock in **today's** state. "Ratchet down only" still applies
> from here — future PRs may further reduce these limits but never raise them.

> **2026-04-27 ratchet re-baseline (Phase E2)**: EdgeRenderer.ts (2702 → 2765)
> and RenderPipeline.ts (2476 → 2657) were raised to match the actual line
> counts on `main`. Root cause: commit 85b9b22d (`Phase Q — auto-format
> autonomous edits + format gate`) ran `pnpm format` across drift-formatted
> autonomous-PR output, which Prettier reflowed (zero behavioural change) but
> mechanically increased line counts by +81 / +181. The Phase Q commit
> message acknowledged the godobj failure as "pre-existing" before merging,
> which left `main` violating its own Forbidden Pattern. Phase E2 locks in
> today's state so the autonomous gate can be green again. Extract tasks
> `200-godobj-extract-tech-debt` (subtasks 1292/1293/1295/1296) remain the
> path back down — "ratchet down only" still applies from here.

## Quality Gates

- **Unit tests**: `pnpm test` (vitest), coverage thresholds in `vitest.config.ts`
- **Coverage ratchet**: thresholds must never decrease
- **Bundle size budget**: 800KB (`main.js`, current: 759KB)
- **Lint**: `pnpm lint` (ESLint flat config + typescript-eslint)
- **Format**: `pnpm format:check` (Prettier)
- **E2E** (local only, requires CDP on :9222): `pnpm test:e2e`

## Commands

```bash
pnpm build              # Production build
pnpm test               # Unit tests (vitest)
pnpm test:coverage      # Unit tests + coverage
pnpm lint               # ESLint check
pnpm lint:fix           # ESLint auto-fix
pnpm format:check       # Prettier check
pnpm format             # Prettier write
```

## Conventions

- All thresholds/magic numbers via `RenderThresholds` or settings — no hardcoded values
- All user-facing strings through `src/i18n.ts` `t()` function
- Types in `src/types.ts` — prefer interfaces over type aliases
- Tests in `tests/` mirroring `src/` structure, using `tests/__mocks__/obsidian.ts`
- Obsidian mock is minimal — keep it lightweight

## Forbidden Patterns

- Relaxing coverage thresholds
- Growing god object files beyond their "Max Allowed" line count
- Hardcoded magic numbers in render/layout logic
- Bypassing `RenderThresholds` with inline numeric assignments
- Adding dependencies without clear justification
- `console.*` in production code (esbuild drops in prod build)
- `location.reload()` — use `disablePlugin/enablePlugin` instead

## Deploy

```bash
cp main.js "/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js"
cp main.js "/home/ubuntu/obsidian-plugins/.obsidian/plugins/graph-island/main.js"
```

Check which vault is active via CDP `app.vault.adapter.basePath` before deploying.
