---
priority: high
reported: 2026-04-15
status: pending
source: decomposed
parent: 132-e2e-smoke-fail
depends: none
summary: showOrphans E2Eテスト失敗の調査と修正
---

## Description (subtask of 132-e2e-smoke-fail)

E2Eテスト「showOrphans=false reduces nodes」の失敗を修正する。
  
  根本原因: BASELINE が pixiNodes.size で取得されるのに対し、
  renderAndCount は getGraphData().nodes.length を返す。
  この2つの計測方法の不一致がテスト失敗の原因。
  
  修正方針:
  1. まずCDPで実際の値を確認（BASELINE vs getGraphData with showOrphans=true/false）
  2. BASELINE の取得を pixiNodes.size → getGraphData().nodes.length に統一する
     （beforeAll 内で renderAndCount({ showOrphans: true }) を呼ぶ、
      もしくは getGraphData().nodes.length で直接取得）
  3. もしくは renderAndCount 側を pixiNodes.size に統一する
  4. 修正後 pnpm exec playwright test e2e/smoke.spec.ts で全18テストがPASSすることを確認
  
  注意:
  - 他の16テストも renderAndCount を使っている。BASELINE変更時は全テストへの影響を確認
  - GVC (God Object) は変更禁止。テストファイルのみ修正
  - renderAndCount のwait時間(2000ms)が不十分な可能性もあるので、
    CDP接続して実値を確認してから方針を決定すること
```

---

このバグは **単一タスク** で十分対応可能です。原因はテストの計測不一致であり、`graph-filter.ts` や `GraphViewContainer.ts` のロジック修正は不要と判断しました。テストファイル `e2e/smoke.spec.ts` のBASELINE取得方法を `getGraphData().nodes.length` に統一すれば解決する見込みです。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
