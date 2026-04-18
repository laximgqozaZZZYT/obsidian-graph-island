---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1072-1056-639-626-subtask-active-1-status-done
depends: subtask-1
summary: 選定ファイルの status 行を done に置換し差分を検証
---

## Description (subtask of 1072-1056-639-626-subtask-active-1-status-done)

1. subtask-1 で選定されたファイルを Read し、frontmatter の `status:` 行が
     ちょうど 1 行のみであることを確認する。
  2. Edit で以下を replace_all=false で 1 件のみ実施:
     - `status: decomposed` → `status: done`
     - 無ければ `status: in-progress` → `status: done`
  3. Bash `git status --short` で変更が当該 1 ファイルのみであることを確認。
  4. Bash `git diff -- <file>` で frontmatter の status 1 行のみが差分に
     なっていることを確認。
  5. 再度 Read して priority / reported / source / parent / depends / summary /
     Description 本文が一字一句保持されていることを確認する。

  受け入れ基準:
  - 選定ファイルの `status:` が `done`
  - frontmatter の他キーと Description 本文が一字一句保持
  - `git status` の変更が当該 1 ファイルのみ
  - ソース/設定未変更のため `pnpm test` / `pnpm lint` は非実行で可

  禁止: src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs,
  God Object 4 ファイルへの変更。git mv や done/ への移動も禁止。
  frontmatter の他フィールド・Description 本文の改変も禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
