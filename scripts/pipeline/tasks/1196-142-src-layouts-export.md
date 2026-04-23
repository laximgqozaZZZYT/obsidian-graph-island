---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 142-coverage-drop
depends: none
summary: src/layouts/ の export 済み純粋関数にテスト追加
---

## Description (subtask of 142-coverage-drop)

`pnpm test:coverage` の結果から `src/layouts/` 配下でカバレッジが低いファイルを特定する。
  候補: cluster-force.ts, timeline-layout.ts の未カバー分岐、radial.ts, grid.ts, concentric.ts 等の純粋関数。
  既に export されている関数 (既テストと重複しないもの) に対して、tests/layouts/ に境界値テストを 15-20 件追加する。
  - ノード 0/1/N 件
  - 孤立ノード、自己ループ、重複エッジ
  - 極端な入力 (巨大な値、負値、NaN safe-guard)
  **既存の god object ファイル (GraphViewContainer.ts 等) は絶対に触らない**。
  layout 関数の新規 export が必要な場合、layouts/ 内のファイルに最小限の export 追加のみ許可。
  完了基準: `pnpm test` 全 PASS、functions カバレッジが +0.5% 以上上昇。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
