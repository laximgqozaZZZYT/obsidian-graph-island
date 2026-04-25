## Description (subtask of 1276-visual-regression)

既存の LabelManager テストに以下を追加(既存ファイルがなければ tests/views 配下の近似テストファイルに追加するか、新規作成):
  
  1. zoom=0.087, 200 ノード(non-super 195 + super 5)時、`_promoteDiversityNodes` 後の visible 候補が ≥20 件になることを検証
  2. zoom=0.5(threshold=0.2 を超える)時は従来通り `labelMinNonSuper` (5) で動作することを検証(回帰防止)
  3. `labelMinNonSuperZoomedOut` を thresholds で 30 に上書きしたとき 30 件確保されることを検証
  
  vitest + tests/__mocks__/obsidian.ts を使用。`_promoteDiversityNodes` は private なので `applyTextFade()` 経由で観測するか、必要であればアクセス用に `expose-internals-for-test` パターンを使う(既存パターンに合わせる)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
