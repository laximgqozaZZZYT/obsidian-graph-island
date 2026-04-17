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
| `src/views/GraphViewContainer.ts` | 8600 | 8600 | 1 — extract: snapshot, export, filter orchestration |
| `src/views/PanelBuilder.ts` | 2216 | 2216 | 2 — extract: individual panel sections |
| `src/views/EdgeRenderer.ts` | 2702 | 2702 | 3 — extract: cable-tray rendering, label rendering |
| `src/views/RenderPipeline.ts` | 2321 | 2321 | 4 — extract: LOD logic, culling logic |

"Max Allowed" = current line count. Ratchet down only.

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
