---
priority: high
reported: 2026-04-11
status: done
source: decomposed
parent: 080-perf-and-basic-ops-bugs
depends: subtask-2
summary: fullスイート実行→残存バグ修正（バッチA: 前半ファイル群）
---

## Description (subtask of 080-perf-and-basic-ops-bugs)

1. subtask-2のコミットをベースに作業
  2. `npx playwright test --config e2e/cdp-e2e.config.ts --grep-invert "phase"` でphase系を除く主要テストを実行
     （phase系は数が多く独立性が高いため subtask-4 で処理）
  3. 失敗テストを記録し、共通パターンでグループ化
     - CDP接続/タイミング系 → fixture/helper修正
     - 描画結果不一致 → RenderPipeline, EdgeRenderer修正
     - 設定値不整合 → PanelBuilder, settings修正
     - レイアウト系 → layouts/*.ts修正
  4. パターンごとに根本原因を修正（個別テストのskipは最終手段）
  5. 修正後に対象テストを再実行して確認
  6. `pnpm build && pnpm test && pnpm lint` でgate通過を確認
  7. コミット

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
