---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1062-1047-issue-1020-1013-subtask-status-done
depends: none
summary: 1020-1013-subtask の frontmatter status を done に更新
---

## Description (subtask of 1062-1047-issue-1020-1013-subtask-status-done)

1. `ls issues/ | grep '^1020-1013-subtask'` で対象ファイルを特定
  2. Read で該当 .md ファイルの frontmatter を確認
  3. Edit で `status:` 行のみを `status: done` に書き換え
     - `status: decomposed` / `status: decomposed` いずれも `status: done` に統一
  4. 他の frontmatter フィールド (priority, reported, source, parent, depends, summary) および本文は一切変更しない
  5. `git mv` は使用禁止（ファイル名変更しない）
  6. `git add <対象ファイル>` 後、`git diff --cached` で `status:` 1行のみの差分であることを確認
  7. YAML の `---` 区切りとコロン位置が壊れていないか目視確認
  8. コミット: `chore(issues): mark 1020-1013-subtask as done`
  9. lint/test/build は issues/ 配下の md 変更のみのため実行不要

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
