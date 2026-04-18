# 582-570 Format Check Report

Parent: 582-570-graphviewcontainer-ts-verify-only
Subtask: 612-598-pnpm-format-check (decomposed from 598-582-pnpm-lint-pnpm-format-check)

## Run 2026-04-18

- Command: `pnpm format:check`
- Working dir: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/.autonomous-worktrees/auto-20260418-152001-1574521`
- Elapsed: 30.71s
- Exit code: 1 (FAIL — style issues detected)
- Auto-fix: not executed (prohibited by task spec)

### Result
FAIL: Code style issues found in 4 files.

### Violating files
- `src/views/EdgeRenderer.ts`
- `src/views/pan-inertia-controller.ts`
- `src/views/RenderPipeline.ts`
- `tests/views/pan-inertia-controller.test.ts`

### Raw output
```
> obsidian-graph-island@0.6.0 format:check /home/ubuntu/obsidian-plugins/obsidian-graph-island/.autonomous-worktrees/auto-20260418-152001-1574521
> prettier --check src/ tests/

Checking formatting...
[warn] src/views/EdgeRenderer.ts
[warn] src/views/pan-inertia-controller.ts
[warn] src/views/RenderPipeline.ts
[warn] tests/views/pan-inertia-controller.test.ts
[warn] Code style issues found in 4 files. Run Prettier with --write to fix.
 ELIFECYCLE  Command failed with exit code 1.
```

### Remediation (not applied)
Run `pnpm format` (a.k.a. `prettier --write src/ tests/`) in a follow-up task to fix. Prettier's `--check` output does not emit per-line diagnostics; it lists offending files only. Per-line diffs require running `prettier --check --loglevel debug` or `prettier --list-different` with a separate diff pass — not in scope for this subtask.
