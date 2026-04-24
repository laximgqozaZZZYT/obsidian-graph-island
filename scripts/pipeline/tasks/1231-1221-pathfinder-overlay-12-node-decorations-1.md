---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1221-143-renderer-decorator-constants-ts
depends: subtask-1
summary: pathfinder-overlay(12) と node-decorations(11) の定数を constants.ts に集約
---

## Description (subtask of 1221-143-renderer-decorator-constants-ts)

1. `pathfinder-overlay.ts` の定数（約12個）を `PATHFINDER_` プレフィクスで `constants.ts` に移動。
  2. `node-decorations.ts` の定数（約11個）を `NODE_DECO_` プレフィクスで `constants.ts` に移動。
  3. それぞれのファイルで `import` に置き換え、インラインリテラルを撤廃。
  4. `constants.ts` の `// ---- Renderer decorations ----` セクション配下に追記（subtask-1で作成済み）。
  5. ズーム/LOD/密度スケール系は除外。
  6. `pnpm test` と `pnpm lint` が通ることを確認。
  禁止: `EdgeRenderer.ts`, `RenderPipeline.ts` は触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
