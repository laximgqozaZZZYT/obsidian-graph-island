---
priority: high
reported: 2026-04-25
status: pending
source: decomposed
parent: 1240-1236-src-constants-ts-pathfinder-12
depends: none
summary: src/constants.ts に PATHFINDER_ プレフィクスの描画定数12個を追加する
---

## Description (subtask of 1240-1236-src-constants-ts-pathfinder-12)

1. `src/views/pathfinder-overlay.ts` を Read で精読し、描画用インライン数値リテラル12個を特定する（線幅、矢印サイズ、矢印角度、ラベル padding、ラベル フォントサイズ、ノードハロー半径、線透明度、グロウブラー、ダッシュパターン、オフセット px 等）。ズーム閾値・LOD 閾値・密度スケール係数は対象外。
  2. `src/constants.ts` を Read し、既存セクション構成を確認する。既存の `// ---- Renderer decorations ----` 等の近接箇所、または末尾に `// ---- Pathfinder overlay ----` セクションを新設する。
  3. 抽出した12個の定数を `PATHFINDER_` プレフィクス付き `export const` として追加する。命名例:
     - `PATHFINDER_LINE_WIDTH`
     - `PATHFINDER_ARROW_SIZE`
     - `PATHFINDER_ARROW_ANGLE_RAD`
     - `PATHFINDER_LABEL_PADDING`
     - `PATHFINDER_LABEL_FONT_SIZE`
     - `PATHFINDER_NODE_HALO_RADIUS`
     - `PATHFINDER_LINE_ALPHA`
     - `PATHFINDER_GLOW_BLUR`
     - `PATHFINDER_DASH_PATTERN`
     - `PATHFINDER_OFFSET_PX`
     その他意味が伝わる名前にする。
  4. `src/views/pathfinder-overlay.ts` 本体は変更しない（Read のみ）。変更は subtask 2（別 issue）で行う。
  5. 禁止ファイル変更厳守: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts`, `src/views/GraphViewContainer.ts`, `src/views/PanelBuilder.ts` には触らない。
  6. `pnpm lint` と `pnpm test` を実行し、constants.ts への純粋な追加で既存テストが全 green であることを確認する。
  7. 完了後にコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
