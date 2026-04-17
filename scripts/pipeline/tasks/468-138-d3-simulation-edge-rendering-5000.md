---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 138-perf-usability-overhaul
depends: subtask-2
summary: D3 simulation再起動抑制 + edge rendering 5000+エッジ最適化
---

## Description (subtask of 138-perf-usability-overhaul)

simulation-guard.ts に shouldRestartSimulation(prevParams, nextParams, thresholds) を純粋関数で実装。
  - alpha が閾値未満かつ params 差分が無視できるなら再起動しない
  - ノード数変化 / layout変更のみ再起動許可
  GraphViewContainer から simulation.alpha(1).restart() を呼ぶ箇所を guard 経由に差替 (新規コード行はガード呼び出しのみ)。
  EdgeRenderer.ts は新規関数を増やさず、既存 shouldSkipEdge / drawEdges の**内側**で early-exit を追加:
  - 5000+エッジ時、viewport外エッジを bbox culling で skip
  - LOD低域で decoration/label 描画を完全スキップ
  GOD OBJECT ratchet を守るため EdgeRenderer.ts 総行数は 2712 を超えないこと。
  テスト: simulation-guard.test.ts + 既存 EdgeRenderer テストに culling ケース追加。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
