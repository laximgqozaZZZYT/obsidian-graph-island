
## Description (subtask of 1231-1221-pathfinder-overlay-12-node-decorations-1)

1. `src/views/node-decorations.ts` を読み、インライン数値リテラル（バッジ半径、アイコンサイズ、リング太さ、オフセット、パディング、ラベルフォントサイズ、透明度等の描画定数）を約11個抽出する。
  2. ズーム/LOD/密度スケール系は対象外として除外する。
  3. `src/constants.ts` の `// ---- Renderer decorations ----` セクション配下に `NODE_DECO_` プレフィクス付きの `export const` として追加する (例: `NODE_DECO_BADGE_RADIUS`, `NODE_DECO_RING_WIDTH`, `NODE_DECO_LABEL_OFFSET_Y` 等)。subtask-1 で追加済みの `PATHFINDER_*` 群と並べて配置する。
  4. `node-decorations.ts` 内のインラインリテラルを `import { NODE_DECO_XXX } from '../constants'` に置換する。
  5. `pnpm test` と `pnpm lint` が green であることを確認する。
  6. 禁止: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/pathfinder-overlay.ts` を変更しない（subtask-1 の変更には触れない）。
  7. CLAUDE.md の GOD OBJECT Policy に従い、`node-decorations.ts` の行数を増やさない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
