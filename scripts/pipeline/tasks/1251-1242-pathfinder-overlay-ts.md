---
priority: high
reported: 2026-04-25
status: pending
source: decomposed
parent: 1242-1237-pathfinder-overlay-ts-lint-test
depends: subtask-2
summary: pathfinder-overlay.ts の行数を確認しコミットする
---

## Description (subtask of 1242-1237-pathfinder-overlay-ts-lint-test)

1. `wc -l src/views/pathfinder-overlay.ts` を実行し、現在の行数を記録する。
  2. `git log` で subtask-2-impl コミット前の行数と比較する。import 追加による 1-2 行の純増は許容、それ以上増えていれば原因を特定し余計な変更を revert する。
  3. `git status` で禁止ファイル (`src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts`) に変更がないことを再確認する。
  4. 変更を `git add src/views/pathfinder-overlay.ts` でステージし、`git commit` で修正コミットを作成する (subtask-2-impl とは別コミット)。
  5. コミット後に `pnpm lint && pnpm test` を最終確認として実行する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
