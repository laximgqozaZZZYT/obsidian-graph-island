---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1234-1231-pathfinder-overlay-ts-12-constants-ts-pa
depends: none
summary: pathfinder-overlay.ts から 12 個の描画定数を抽出し src/constants.ts に PATHFINDER_ プレフィクスで追加
---

## Description (subtask of 1234-1231-pathfinder-overlay-ts-12-constants-ts-pa)

1. `src/views/pathfinder-overlay.ts` を Read で精読し、描画用のインライン数値リテラル（線幅、矢印サイズ、半径、マージン、フォントサイズ、透明度、ラベル padding、オフセット 等）を約 12 個抽出する。
  2. ズーム閾値・LOD 閾値・密度スケール係数 は対象外として除外する。除外したリテラルは subtask 2 のメモとして PR 本文に残せるよう識別だけしておく（このタスクではコード変更しない）。
  3. `src/constants.ts` を Read し、subtask-1 (1221-143) で作成された `// ---- Renderer decorations ----` セクションを確認する。セクションが存在しない場合は近接する適切なセクション末尾に `// ---- Pathfinder overlay ----` を新設する。
  4. 抽出した定数を `PATHFINDER_` プレフィクス付きの `export const` として追加する。命名例: `PATHFINDER_LINE_WIDTH`, `PATHFINDER_ARROW_SIZE`, `PATHFINDER_ARROW_ANGLE_RAD`, `PATHFINDER_LABEL_PADDING`, `PATHFINDER_LABEL_FONT_SIZE`, `PATHFINDER_NODE_HALO_RADIUS`, `PATHFINDER_LINE_ALPHA`, `PATHFINDER_GLOW_BLUR`, `PATHFINDER_DASH_PATTERN`, `PATHFINDER_OFFSET_PX` など、意味が伝わる名前にする。
  5. このタスクでは `pathfinder-overlay.ts` 本体は変更しない（subtask 2 が行う）。
  6. `pnpm lint` と `pnpm test` を実行し、constants.ts への純粋な追加なので既存テストが全 green であることを確認する。
  7. 禁止ファイル変更厳守: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts` には触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
