## Description (subtask of 201-pathfinder-overlay-extract-constants)

`src/views/pathfinder-overlay.ts` を全文読み、インライン数値リテラル
  (色値・パルス速度・グロー幅・ラベルオフセット・ストローク幅・透明度等)
  を 10 個以上特定する。ズーム/LOD/密度スケール係数のリテラルは
  描画文脈依存のため対象外。

  `src/constants.ts` の `// ---- Renderer decorations ----` 付近に
  `export const PATHFINDER_*` を追加 (例: PATHFINDER_GLOW_WIDTH,
  PATHFINDER_PULSE_SPEED, PATHFINDER_LABEL_OFFSET_X, PATHFINDER_STROKE_WIDTH,
  PATHFINDER_BG_ALPHA など)。各定数に該当の意味を 1 行コメント。

  `pathfinder-overlay.ts` 内の該当リテラルを定数参照に Edit で置換。
  import 文に `PATHFINDER_*` を追加。

  受け入れ基準:
  - `grep '^export const PATHFINDER_' src/constants.ts | wc -l` ≥ 10
  - `pnpm lint` PASS
  - `pnpm test` PASS
  - `pnpm build` PASS
  - god-object 対象 4 ファイル (GraphViewContainer.ts / PanelBuilder.ts /
    EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - constants.ts への純粋追加のみ (既存定数の改名・削除は禁止)
  - pathfinder-overlay.ts は置換のみで行数を増やさない

  禁止:
  - 新規ファイル作成
  - issue ファイルの status 書き換え等のメタ作業
  - 「定数追加」「リテラル置換」を別 PR / 別 task に分けること
    (旧 chain 破綻の原因なので必ず 1 task で完結させる)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
