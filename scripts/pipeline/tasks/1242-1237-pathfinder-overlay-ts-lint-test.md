---
priority: high
reported: 2026-04-24
status: decomposed
source: decomposed
parent: 1237-1234-pathfinder-overlay-ts-pathfinder-import
depends: subtask-2-impl
summary: pathfinder-overlay.ts 置換後の lint / test / 行数検証を行い、問題があれば修正する
---

## Description (subtask of 1237-1234-pathfinder-overlay-ts-pathfinder-import)

1. `pnpm lint` を実行する。import 漏れ・未使用 import・型エラーがあれば `pnpm lint:fix` で自動修正可能なものを修正し、手動修正が必要なものは Edit で対応する。
  2. `pnpm lint:fix` で修正されなかった項目については、pathfinder-overlay.ts に限定して手動修正する（他ファイルへの波及はしない）。
  3. `pnpm test` を実行し、全テストが green であることを確認する。失敗があれば `pathfinder-overlay` 関連の失敗を優先的に調査し、置換誤りがあれば該当箇所を revert またはインラインリテラルに戻す。
  4. `wc -l src/views/pathfinder-overlay.ts` を実行し、変更前の行数と比較する。増加している場合は原因を特定する（通常は import 文 1 行分の純増は許容）。
  5. 禁止ファイル (`src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts`) に変更が入っていないことを `git status` で確認する。
  6. 問題がなければ修正コミットを作成する（subtask-2-impl のコミットと統合する必要はない）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
