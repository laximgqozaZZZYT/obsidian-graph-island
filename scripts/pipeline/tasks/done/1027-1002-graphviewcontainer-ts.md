---
priority: high
reported: 2026-04-19
status: done
source: decomposed
parent: 1002-871-subtask
depends: none
summary: GraphViewContainer.ts の抽出対象メソッドを調査してマップ化
---

## Description (subtask of 1002-871-subtask)

`src/views/GraphViewContainer.ts` (8597行) から以下3カテゴリのメソッドを調査し、行範囲を列挙する。
  - snapshot 関連: `_takeSnapshot`, `_restoreSnapshot`, `_snapshotState`, プリセット保存/復元系
  - export 関連: `_exportSVG`, `_exportPNG`, `_exportPreset`, `exportGraphSVG` 呼び出し箇所
  - filter 関連: `getGraphData` 内の filter chain (showOrphans / existingOnly / showSimilar / searchQuery 等)

  成果物: `docs/decomposition/gvc-extraction-map.md` に、各カテゴリごとに `(startLine, endLine, methodName, 依存する private フィールド)` を表形式で記録。
  実装変更なし、調査のみ。テスト追加なし。
  CLAUDE.md のルール (god object を肥大化させない) に違反しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
