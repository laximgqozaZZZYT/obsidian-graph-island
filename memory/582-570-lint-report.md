# Lint Report — 582-570-graphviewcontainer-ts-verify-only

Append-only verification log for `pnpm lint`.
Source task: `scripts/pipeline/tasks/611-598-pnpm-lint.md`
Parent: `598-582-pnpm-lint-pnpm-format-check` → `582-570-graphviewcontainer-ts-verify-only`

---

## Run 2026-04-18T15:32:27+09:00

- Command: `pnpm lint` (== `eslint src/`)
- Working dir: `.autonomous-worktrees/auto-20260418-151001-1493682`
- Runner: pnpm v10.30.3, eslint v10.1.0, typescript-eslint v8.58.0
- Exit code: `0`
- Duration: `20.37s`
- Summary: **PASS (0 errors, 12 warnings)** — exit 0 because default `--max-warnings` is unlimited.
- Note: `pnpm install --prefer-offline --no-frozen-lockfile` was required first because the worktree's `node_modules/` was empty (only `.vite/`). System `/usr/bin/eslint` v6.4.0 is not flat-config-compatible and must be shadowed by the project-local install.
- No auto-fix (`lint:fix`) was executed.

### Warnings (12) — rule: `@typescript-eslint/no-unused-vars`

| File | Line:Col | Symbol | Message |
|------|---------|--------|---------|
| `src/layouts/timeline-types.ts` | 15:11 | `TimelineNode` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/layouts/timeline-types.ts` | 31:11 | `TimelineEdge` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/layouts/timeline-types.ts` | 38:11 | `TimelineChain` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/layouts/timeline-types.ts` | 46:11 | `CycleBackEdge` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/layouts/timeline-types.ts` | 54:11 | `HierarchyTree` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/layouts/timeline-types.ts` | 64:11 | `TimelineLane` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/layouts/timeline-types.ts` | 78:11 | `TimelinePlacement` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/obsidian-internals.ts` | 80:11 | `ObsidianVaultInternal` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/utils/node-shapes.ts` | 6:7 | `NODE_SHAPES` | assigned a value but only used as a type. Allowed unused vars must match `/^_/u` |
| `src/views/GraphViewContainer.ts` | 22:2 | `ClusterArrangement` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/views/panel-defaults.ts` | 10:10 | `defaultHoverAndClusterConfig` | defined but never used. Allowed unused vars must match `/^_/u` |
| `src/views/panel-defaults.ts` | 49:10 | `defaultAdvancedConfig` | defined but never used. Allowed unused vars must match `/^_/u` |

Totals: `✖ 12 problems (0 errors, 12 warnings)`

### Raw stderr notes

```
(node:XXXXX) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../eslint.config.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to .../package.json.
```

This is a Node.js informational warning about `eslint.config.js` being reparsed as ESM; it does not affect lint results.

---

## Run 2026-04-18T16:10:27+09:00

- Command: `pnpm lint` (== `eslint src/`)
- Working dir: `.autonomous-worktrees/auto-20260418-154501-1777009`
- Source task: `scripts/pipeline/tasks/610-598-subtask.md`
- Exit code: `0`
- Summary: **PASS (0 errors, 12 warnings)** — identical to 2026-04-18T15:32:27+09:00 run. Warning set unchanged (same 12 entries, same files, same rule `@typescript-eslint/no-unused-vars`).
- No auto-fix executed. Result confirms lint gate stays green in this worktree.
