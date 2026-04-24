---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1236-1234-pathfinder-overlay-ts-12-src-constants-t
depends: none
summary: src/constants.ts に PATHFINDER_ プレフィクスで描画定数12個を追加
---

## Description (subtask of 1236-1234-pathfinder-overlay-ts-12-src-constants-t)

1. `src/views/pathfinder-overlay.ts` を Read で精読し、描画用インライン数値リテラルを約12個特定する（線幅、矢印サイズ、矢印角度、ラベル padding、ラベル フォントサイズ、ノードハロー半径、線透明度、グロウブラー、ダッシュパターン、オフセット px 等）。
  2. ズーム閾値・LOD 閾値・密度スケール係数は対象外。
  3. `src/constants.ts` を Read し、既存の `// ---- Renderer decorations ----` セクション等の近接箇所に `// ---- Pathfinder overlay ----` セクションを新設する（既存なら末尾に追記）。
  4. 抽出した12個の定数を `PATHFINDER_` プレフィクス付き `export const` として追加する。命名例: `PATHFINDER_LINE_WIDTH`, `PATHFINDER_ARROW_SIZE`, `PATHFINDER_ARROW_ANGLE_RAD`, `PATHFINDER_LABEL_PADDING`, `PATHFINDER_LABEL_FONT_SIZE`, `PATHFINDER_NODE_HALO_RADIUS`, `PATHFINDER_LINE_ALPHA`, `PATHFINDER_GLOW_BLUR`, `PATHFINDER_DASH_PATTERN`, `PATHFINDER_OFFSET_PX` 等、意味が伝わる名前にする。
  5. `src/views/pathfinder-overlay.ts` 本体は変更しない（Read のみ）。変更は subtask 2（別 issue）で行う。
  6. `pnpm lint` と `pnpm test` を実行し、constants.ts への純粋な追加で既存テストが全 green であることを確認する。
  7. 禁止ファイル変更厳守: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts` には触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
