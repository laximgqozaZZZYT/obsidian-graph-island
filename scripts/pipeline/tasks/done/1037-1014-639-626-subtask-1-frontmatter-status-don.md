---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1014-992-issues-pending-639-626-subtask-md-status
depends: none
summary: 639-626 subtask 対象ファイル 1 件の frontmatter status を done に置換
---

## Description (subtask of 1014-992-issues-pending-639-626-subtask-md-status)

手順:
  1. `ls scripts/pipeline/tasks/ | grep -E '639-626.*subtask'` で active 配下(done/ 配下は除外)の候補を列挙
  2. 候補が複数ある場合は、frontmatter の `status:` 値が `decomposed` または `in-progress` のものかつ `depends:` が `none` のものから ID 番号が最小のファイルを 1 つだけ選ぶ (選定根拠をコメントで出力)
  3. Read で選定ファイル全文を取得し、frontmatter 中の `status:` 行が 1 行のみであることを確認
  4. Edit で `status: decomposed` (なければ `status: decomposed`) → `status: done` に replace_all=false で置換 (一致 1 件を厳守)
  5. `git status --short` で変更が当該 1 ファイルのみ、`git diff -- <file>` で frontmatter の status 行 1 行だけが差分になっていることを確認
  6. 他フィールド (priority/reported/source/parent/depends/summary) と Description 本文が完全一致で保持されていることを再 Read で確認

  禁止:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs の変更
  - God Object 4 ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) への一切の変更
  - `git mv` / ファイル移動 (done/ への移動は別 issue)
  - frontmatter のほかフィールドや Description 本文の改変

  受け入れ基準:
  - 選定ファイルの `status:` が `done`
  - frontmatter のほかキーと Description 本文が一字一句保持
  - `git status` の変更が当該 1 ファイルのみ
  - ソース/設定ファイル未変更のため `pnpm test` / `pnpm lint` は非実行で可 (コードに影響なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
