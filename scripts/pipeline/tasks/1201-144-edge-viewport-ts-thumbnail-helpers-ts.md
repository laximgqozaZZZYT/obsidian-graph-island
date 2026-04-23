---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 144-coverage-drop
depends: none
summary: edge-viewport.ts と thumbnail-helpers.ts に単体テスト追加
---

## Description (subtask of 144-coverage-drop)

src/views/edge-viewport.ts (32行・未テスト) の `computeEdgeViewport(cfg, margin)` を対象に
  6-8件のテストを tests/views/edge-viewport.test.ts に追加する:
  - default margin (200) で worldScale=1, viewport 全0 のとき left/right/top/bottom が期待通り
  - worldScale=2 で座標が半分にスケールされること
  - viewportX/Y による平行移動の反映
  - margin=0 / 大きい margin の境界値
  - worldScale undefined → 1 として扱われること
  
  src/views/thumbnail-helpers.ts (32行・未テスト) の純関数を対象に
  tests/views/thumbnail-helpers.test.ts を新規作成し、以下を追加:
  - extractFrontmatterImage: image / thumbnail / cover の優先順位、null/undefined/非string拒否
  - isNodeOnScreen: 範囲内/外/境界 (margin 含む) の組み合わせ 5-6件
  - createThumbnailClone は DOM 依存なので JSDOM 範囲でクラス名/サイズ/位置を assert (4件)
  
  期待: 関数 ~5件 + statements ~50行をカバー

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
