---
priority: high
reported: 2026-04-24
status: decomposed
source: decomposed
parent: 1235-1231-node-decorations-ts-11-constants-ts-node
depends: none
summary: constants.ts に NODE_DECO_ プレフィクスで 11 個の定数を追加
---

## Description (subtask of 1235-1231-node-decorations-ts-11-constants-ts-node)

1. `src/views/node-decorations.ts` を Read ツールで全文読み、バッジ半径・アイコンサイズ・リング太さ・オフセット・パディング・ラベルフォントサイズ・透明度などのインライン数値リテラルを約 11 個特定する。ズーム/LOD/密度スケール系 (1 / zoom, lodLevel 由来, density 由来) は対象外として除外する。
  2. `src/constants.ts` の `// ---- Renderer decorations ----` セクション配下 (subtask-1 で追加済みの `PATHFINDER_*` 群のすぐ下) に `NODE_DECO_` プレフィクス付きの `export const` を 11 個追加する。命名例: `NODE_DECO_BADGE_RADIUS`, `NODE_DECO_RING_WIDTH`, `NODE_DECO_LABEL_OFFSET_Y`, `NODE_DECO_ICON_SIZE`, `NODE_DECO_LABEL_FONT_SIZE`, `NODE_DECO_LABEL_PADDING`, `NODE_DECO_HALO_ALPHA` 等。意味が明確な名前を選ぶこと。
  3. この時点では node-decorations.ts 側の参照置換は行わない (値の定義のみ)。ただし各定数の JSDoc コメント 1 行 (どの描画要素のパラメータか) を付ける。
  4. `pnpm build` で型エラーがないことを確認する。
  5. 禁止: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/pathfinder-overlay.ts` を変更しない。node-decorations.ts の実装ロジックも触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
