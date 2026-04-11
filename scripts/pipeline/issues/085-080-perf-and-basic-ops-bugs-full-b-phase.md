---
priority: high
reported: 2026-04-11
status: pending
source: decomposed
parent: 080-perf-and-basic-ops-bugs
depends: subtask-3
summary: fullスイート実行→残存バグ修正（バッチB: phase系 + 残り）
---

## Description (subtask of 080-perf-and-basic-ops-bugs)

1. subtask-3のコミットをベースに作業
  2. `npx playwright test --config e2e/cdp-e2e.config.ts` で全スイートを実行
  3. subtask-3で未解消の失敗を修正
     - phase系UIテスト (phase1-32): UI設定パネルの動作検証
     - zoom系: zoom-audit, zoom-label-emphasis, zoom-lod-cascade, zoom-overlap
     - visual系: visual-features, visual-verification
  4. パフォーマンス関連の問題を特定（不要な再描画・再計算）
     - markDirty()の過剰呼び出し
     - requestRender()のデバウンス不足
     - getGraphData()の不要な再フィルタリング
  5. パフォーマンス修正があれば実施
  6. 全スイートが pass することを最終確認
  7. `pnpm build && pnpm test && pnpm lint` でgate通過を確認
  8. コミット

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
