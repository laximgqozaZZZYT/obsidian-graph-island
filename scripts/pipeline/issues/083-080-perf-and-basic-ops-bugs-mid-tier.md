---
priority: critical
reported: 2026-04-11
status: in-progress
source: decomposed
parent: 080-perf-and-basic-ops-bugs
depends: subtask-1
summary: mid-tierテスト実行→失敗の根本原因調査・修正
---

## Description (subtask of 080-perf-and-basic-ops-bugs)

1. subtask-1のコミットをベースに作業
  2. `npx playwright test --config e2e/cdp-mid.config.ts` を実行
  3. 失敗するテストを全て記録（smoke修正で解消された分を除く）
  4. 各失敗について根本原因を調査
     - arrangement関連: cluster-force.ts, layout系
     - settings関連: PanelBuilder, panel-sections
     - groupBy/search: getGraphData filtering pipeline
     - viewMode: view-mode-map, timeline-layout
     - edge toggles: EdgeRenderer, shouldSkipEdge
  5. プロダクションコード側を修正
  6. mid-tier全テストがpassするまで繰り返す
  7. `pnpm build && pnpm test && pnpm lint` でgate通過を確認
  8. コミット

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
