---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 135-e2e-smoke-fail
depends: none
summary: showOrphans=false smoke test失敗の根本原因調査
---

## Description (subtask of 135-e2e-smoke-fail)

e2e/smoke.spec.ts:149 の "3-Filter › showOrphans=false reduces nodes" テストを読み、
  期待する挙動と実際の挙動を確認する。
  - smoke.spec.ts:149-180 付近のassertion内容を確認
  - showOrphans=false 適用時のnode count変化の閾値/条件を確認
  - src/utils/graph-filter.ts の filterOrphans() ロジックを確認
  - getGraphData() パイプライン(GraphViewContainer.ts)でshowOrphans filterが正しい順序で呼ばれているか確認
  - CDP経由で実際にプラグインを動かし、showOrphans toggle前後のnode countをログ出力
  調査結果を investigation-notes として記録し、修正方針を決定する。
  ソースコードは修正せず、調査のみ実施。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
