---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 791-763-subtask
depends: none
summary: git status で変更対象ファイルを特定し一覧化
---

## Description (subtask of 791-763-subtask)

`git status --short` を実行し、現在の作業ツリーで変更されているファイル一覧を取得する。
  - Modified (M), Added (A), Deleted (D), Untracked (??) を分類
  - 結果を構造化形式(ファイルパス + 変更タイプ)で出力
  - 副作用なし: add/commit/mv は一切行わない
  - GOD OBJECT ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) が含まれていたら行数増加していないか注記
  - Acceptance: 出力リストが空でも正常終了 (No changes の場合)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
