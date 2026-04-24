---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1221-143-renderer-decorator-constants-ts
depends: subtask-2
summary: card-renderer(10) と layout-compute(10) の定数を constants.ts に集約
---

## Description (subtask of 1221-143-renderer-decorator-constants-ts)

1. `card-renderer.ts` の定数（約10個: カードサイズ、パディング、フォント、境界線等）を `CARD_` プレフィクスで `constants.ts` に移動。
  2. `layout-compute.ts` の定数（約10個: レイアウト計算関連）を用途に応じたプレフィクス（`LAYOUT_COMPUTE_` など、`constants.ts` の既存命名規約に合わせる）で移動。
  3. 該当ファイルでは `import` に置き換え。
  4. ズーム/LOD/密度スケール系は除外。
  5. `pnpm test` と `pnpm lint` が通ることを確認。
  禁止: `EdgeRenderer.ts`, `RenderPipeline.ts` は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
