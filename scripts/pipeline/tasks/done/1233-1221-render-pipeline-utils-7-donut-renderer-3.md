---
priority: medium
reported: 2026-04-24
status: done
source: decomposed
parent: 1221-143-renderer-decorator-constants-ts
depends: subtask-3
summary: render-pipeline-utils(7), donut-renderer(3), matrix-renderer(2) の定数12個を constants.ts に集約
---

## Description (subtask of 1221-143-renderer-decorator-constants-ts)

1. `render-pipeline-utils.ts` の定数（約7個）を `RENDER_PIPE_` プレフィクスで移動。
  2. `donut-renderer.ts` の定数（約3個）を `DONUT_` プレフィクスで移動。
  3. `matrix-renderer.ts` の定数（約2個）を `MATRIX_` プレフィクスで移動。
  4. 各ファイルで `import` に置き換え。
  5. ズーム/LOD/密度スケール系は除外（`RenderThresholds` 範疇）。
  6. issue の全対象ファイル完了後、`constants.ts` の `// ---- Renderer decorations ----` セクションが ~67個の定数を含むことを最終確認。
  7. `pnpm test`, `pnpm lint`, `pnpm build` が通ることを確認（bundle size 800KB 超えないこと）。
  禁止: `EdgeRenderer.ts`, `RenderPipeline.ts` は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
