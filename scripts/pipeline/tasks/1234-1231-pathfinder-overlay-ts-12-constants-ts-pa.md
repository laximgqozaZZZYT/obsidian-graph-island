---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1231-1221-pathfinder-overlay-12-node-decorations-1
depends: none
summary: pathfinder-overlay.ts の定数12個を constants.ts に PATHFINDER_ プレフィクスで集約
---

## Description (subtask of 1231-1221-pathfinder-overlay-12-node-decorations-1)

1. `src/views/pathfinder-overlay.ts` を読み、ファイル内のインライン数値リテラル（マージン、線幅、半径、透明度、フォントサイズ、矢印サイズ、オフセット等の描画定数）を約12個抽出する。
  2. ズーム閾値・LOD閾値・密度スケール係数は対象外として除外する（除外したものをコメントで明示してもよい）。
  3. `src/constants.ts`（subtask-1 (1221-143) で作成された `// ---- Renderer decorations ----` セクション配下）に `PATHFINDER_` プレフィクス付きの `export const` として追加する。命名は意味が伝わる形で (例: `PATHFINDER_LINE_WIDTH`, `PATHFINDER_ARROW_SIZE`, `PATHFINDER_LABEL_PADDING` など)。
  4. `pathfinder-overlay.ts` 内のインラインリテラルを `import { PATHFINDER_XXX } from '../constants'` に置換する。
  5. `pnpm test` と `pnpm lint` が green であることを確認する。
  6. 禁止: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts` を変更しない。
  7. CLAUDE.md の GOD OBJECT Policy に従い、`pathfinder-overlay.ts` の行数を増やさない（純減または同等になるはず）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
