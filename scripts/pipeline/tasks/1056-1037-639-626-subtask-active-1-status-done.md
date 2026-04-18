---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1037-1014-639-626-subtask-1-frontmatter-status-don
depends: none
summary: 639-626 subtask active 候補から1ファイルのみ status: done に置換
---

## Description (subtask of 1037-1014-639-626-subtask-1-frontmatter-status-don)

目的: 親 issue 1014-992 の一部として、active 配下の 639-626-subtask 関連ファイル 1 件のみ frontmatter status を done に置換する。

  手順:
  1. Bash で `ls scripts/pipeline/tasks/ | grep -E '639-626.*subtask'` を実行し、done/ サブディレクトリを含まない active 直下の候補を列挙する。
  2. 候補が複数の場合、Read でそれぞれの frontmatter を順に確認し `status:` が `decomposed` または `in-progress`、かつ `depends:` が `none` のものから ID 番号最小のファイルを 1 件だけ選定。選定根拠(候補一覧と選ばれた ID 理由)をテキスト出力する。
  3. 選定ファイル全文を Read し、frontmatter の `status:` 行がちょうど 1 行のみであることを確認。
  4. Edit で `status: decomposed` → `status: done` (無ければ `status: in-progress` → `status: done`) を replace_all=false で実施。一致 1 件を厳守。
  5. Bash `git status --short` で変更が当該 1 ファイルのみ、`git diff -- <file>` で frontmatter の status 1 行のみが差分になっていることを確認。
  6. 再 Read で priority / reported / source / parent / depends / summary / Description 本文が一字一句保持されていることを確認。

  禁止:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs への変更
  - God Object 4 ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) への変更
  - `git mv` / ファイル移動 (done/ への移動は別 issue)
  - frontmatter の他フィールド・Description 本文の改変

  受け入れ基準:
  - 選定ファイルの `status:` が `done`
  - frontmatter の他キーと Description 本文が一字一句保持
  - `git status` の変更が当該 1 ファイルのみ
  - ソース/設定未変更のため `pnpm test` / `pnpm lint` は非実行で可

`★ Insight ─────────────────────────────────────`
- タスク分解出力は実行すべき最小単位にし、親 issue の受け入れ基準を subtask にそのまま写像すると downstream パイプラインが検証失敗を早期検知できる
- 「一致 1 件を厳守」を明記すると replace_all=false の意味を LLM が解釈しやすく、誤って全置換モードに切り替えるリスクを下げられる
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
