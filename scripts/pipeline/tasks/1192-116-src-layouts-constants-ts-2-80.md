---
priority: medium
reported: 2026-04-24
status: pending
source: decomposed
parent: 116-scattered-constants
depends: subtask-2
summary: src/layouts/ 配下のレイアウト系定数を constants.ts に集約 (バッチ2: ~80個)
---

## Description (subtask of 116-scattered-constants)

src/layouts/ 配下から spacing, step width, lane height, 物理パラメータ等を抽出。
  - 対象: `*_SPACING`, `*_STEP_WIDTH`, `*_LANE_HEIGHT`, `*_ITERATIONS`, `*_DAMPING`, `*_FORCE_*`
  - `src/constants.ts` に `// === LAYOUT ===` セクションを追加
  - レイアウト関数のシグネチャは変更しない（定数の定義場所のみ移動）
  - pnpm test で layout 系テスト (tests/layouts/*) が全て PASS することを確認
  - 目標: 約80個 (358 → 278)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
