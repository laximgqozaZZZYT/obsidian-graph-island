---
priority: high
reported: 2026-04-25
status: blocked
source: decomposed
parent: 1242-1237-pathfinder-overlay-ts-lint-test
depends: none
summary: pathfinder-overlay.ts の lint エラーを確認し、自動修正と手動修正で解消する
---

## Description (subtask of 1242-1237-pathfinder-overlay-ts-lint-test)

1. `pnpm lint` を実行し、pathfinder-overlay.ts に関する警告/エラーを特定する。
  2. `pnpm lint:fix` を実行し、自動修正可能な項目を解消する。
  3. 残った lint エラーを Edit で手動修正する。修正対象は src/views/pathfinder-overlay.ts のみに限定する。
  4. 禁止ファイル (`src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts`) が変更されていないことを `git status` で確認する。変更があれば `git checkout` で戻す。
  5. 再度 `pnpm lint` を実行し、pathfinder-overlay.ts 関連のエラーがゼロであることを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
