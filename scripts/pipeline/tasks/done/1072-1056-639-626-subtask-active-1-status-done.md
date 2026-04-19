---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1056-1037-639-626-subtask-active-1-status-done
depends: none
summary: 639-626-subtask の active 候補から1件のみ status:done に置換
---

## Description (subtask of 1056-1037-639-626-subtask-active-1-status-done)

目的: 親 issue 1037-1014 の subtask として、scripts/pipeline/tasks/ 直下 (done/ を除く) の 639-626-subtask 関連ファイルから 1 件だけ frontmatter `status` を `done` に置換する。

  手順:
  1. Bash `ls scripts/pipeline/tasks/ | grep -E '639-626.*subtask'` で active 直下の候補を列挙 (done/ サブディレクトリは除外)。
  2. 候補が複数なら各ファイルを Read で frontmatter 確認し、`status:` が `decomposed` または `in-progress` かつ `depends: none` のもののうち ID 番号最小の 1 件を選定。選定根拠 (候補一覧と ID 理由) をテキスト出力する。
  3. 選定ファイルを Read し、frontmatter の `status:` 行がちょうど 1 行のみであることを確認。
  4. Edit で `status: decomposed` → `status: done` (無ければ `status: decomposed` → `status: done`) を replace_all=false で 1 件のみ実施。
  5. Bash `git status --short` で変更が当該 1 ファイルのみであること、`git diff -- <file>` で frontmatter の status 1 行のみが差分になっていることを確認。
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

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
