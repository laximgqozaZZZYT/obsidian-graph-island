
## Description (subtask of 143-scattered-constants)

Renderer / Decorator 補助ファイルに散在する定数を `constants.ts` に集約（約67個）。
  対象: EnclosureRenderer(23), pathfinder-overlay(12), node-decorations(11), card-renderer(10), layout-compute(10), render-pipeline-utils(7), donut-renderer(3), matrix-renderer(2)。
  手順:
  1. `constants.ts` に `// ---- Renderer decorations ----` セクションを新設。
  2. 各ファイルの定数を移動、用途別プレフィクス（`ENCLOSURE_`, `PATHFINDER_`, `CARD_`, `DONUT_`, `MATRIX_`, `NODE_DECO_`, `RENDER_PIPE_`）で衝突防止。
  3. 各ファイルで `import` に置き換え。
  4. `pnpm test` と `pnpm lint` が通ることを確認。
  除外: ズーム/LOD/密度スケール系は `RenderThresholds` に属するため対象外（すでに `constants.ts` に `RenderThresholds` がある場合はその下に追加）。
  禁止: `EdgeRenderer.ts`, `RenderPipeline.ts`（GOD OBJECT）を触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
