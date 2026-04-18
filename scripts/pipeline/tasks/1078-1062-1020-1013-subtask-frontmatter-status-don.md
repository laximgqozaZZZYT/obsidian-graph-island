---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1062-1047-issue-1020-1013-subtask-status-done
depends: none
summary: 1020-1013-subtask の frontmatter status を done に更新
---

## Description (subtask of 1062-1047-issue-1020-1013-subtask-status-done)

1. `ls issues/ | grep '^1020-1013-subtask'` で対象ファイルを特定 (想定: `issues/1020-1013-subtask.md` 1件)
  2. Read で現状の frontmatter を確認 (特に `status:` の現在値)
  3. Edit で `status: <現状値>` → `status: done` の1行のみ置換
     - `status: in-progress` / `status: pending` いずれの場合も `status: done` に統一
  4. 変更禁止事項:
     - 他の frontmatter フィールド (priority, reported, source, parent, depends, summary) は一切触らない
     - Description / Acceptance criteria などの本文は変更しない
     - ファイル名変更 (`git mv`) は禁止
  5. `git add issues/1020-1013-subtask*.md` 後、`git diff --cached` で差分が `status:` 1行のみであることを確認
  6. `git commit -m "chore(issues): mark 1020-1013-subtask as done"`
  7. lint / test / build は対象が issues/ 配下の md のみのため実行不要
  8. YAML frontmatter の `---` 区切り・コロン位置が壊れていないか Read で最終確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
