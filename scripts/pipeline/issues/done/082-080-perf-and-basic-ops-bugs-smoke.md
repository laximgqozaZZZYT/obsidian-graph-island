---
priority: critical
reported: 2026-04-11
status: done
source: decomposed
parent: 080-perf-and-basic-ops-bugs
depends: none
summary: smokeテスト実行→失敗の根本原因調査・修正
---

## Description (subtask of 080-perf-and-basic-ops-bugs)

1. `npx playwright test --config e2e/cdp-smoke.config.ts` を実行
  2. 失敗するテストを全て記録
  3. 各失敗の根本原因を調査（CDP evalでランタイム状態を確認）
  4. プロダクションコード側のバグを修正（smoke範囲: data integrity, settings, arrangement, search/filter, groupBy, viewMode, export, edge toggles）
  5. テスト側の問題（タイミング、セレクタ陳腐化）があれば合わせて修正
  6. smoke全テストがpassするまで繰り返す
  7. `pnpm build && pnpm test && pnpm lint` でgate通過を確認
  8. コミット
  注意: God Object (GVC 8612行, RenderPipeline 2361行) を肥大化させない。修正ロジックが大きい場合は新ファイルに抽出すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
