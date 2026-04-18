---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1047-1020-subtask
depends: none
summary: 親 issue 1020-1013-subtask のフロントマター status を done に更新
---

## Description (subtask of 1047-1020-subtask)

対象ファイル: `issues/` 配下にある `1020-1013-subtask` に該当する .md ファイル
  (ファイル名先頭が `1020-1013-subtask` で始まる issue ファイルを `ls issues/ | grep '^1020-1013-subtask'` で特定)

  作業内容:
  1. 該当 issue ファイルを Read で読み込み、現在の frontmatter を確認
  2. frontmatter の `status:` 行を現状値から `status: done` に Edit で書き換える
     - `status: in-progress` の場合 → `status: done`
     - `status: pending` の場合も `status: done` に統一
  3. その他の frontmatter フィールド (priority, reported, source, parent, depends, summary) は一切変更しない
  4. 本文 (Description, Acceptance criteria 等) も変更しない
  5. `git mv` は使用しない (ファイル名変更禁止)
  6. ステージング後 `git diff --cached` で `status:` 1行のみの差分であることを確認
  7. コミットメッセージ: `chore(issues): mark 1020-1013-subtask as done`

  検証:
  - `pnpm lint` `pnpm test` `pnpm build` は対象が issues/ 配下の md のみのため実行不要
  - frontmatter の YAML が壊れていないか目視確認 (`---` 区切り、コロン位置)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
