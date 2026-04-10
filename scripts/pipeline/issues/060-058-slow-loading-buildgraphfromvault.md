---
priority: high
reported: 2026-04-10
status: in-progress
source: decomposed
parent: 058-slow-loading
depends: none
summary: buildGraphFromVault にパフォーマンス計測インストルメンテーションを追加
---

## Description (subtask of 058-slow-loading)

新規ファイル src/utils/perf-timer.ts に軽量な計測ユーティリティを作成:
  - perfMark(label) / perfMeasure(label) → console.debug で duration 出力
  - settings.debugPerf フラグで ON/OFF (デフォルト OFF、production では no-op)
  
  buildGraphFromVault() の各フェーズ (Phase 1-5) の開始・終了に計測を埋め込む:
  - Phase 1: createFileNodes
  - Phase 2: placeNodesByTagGroups
  - Phase 3: buildEdgesFromLinks
  - Phase 4: buildSharedMetadataEdges
  - Phase 5: buildTagNodesAndEdges
  - 全体の合計時間
  
  GraphViewContainer.ts の getGraphData() にも計測を追加:
  - buildGraphFromVault 呼び出し時間
  - フィルタリングパイプライン合計時間
  
  テスト: perf-timer のユニットテスト (enable/disable 動作確認)
  成果物: 計測結果をissueコメントまたはコミットメッセージに記録

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
