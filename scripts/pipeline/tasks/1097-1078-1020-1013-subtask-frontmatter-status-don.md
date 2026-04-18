---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1078-1062-1020-1013-subtask-frontmatter-status-don
depends: none
summary: 1020-1013-subtask の frontmatter status を done に更新してコミット
---

## Description (subtask of 1078-1062-1020-1013-subtask-frontmatter-status-don)

1. `ls issues/ | grep '^1020-1013-subtask'` で対象ファイル名を特定（1件のはず）
  2. Read ツールで該当 .md の frontmatter 先頭を確認し、現在の status 値 (pending / in-progress) を把握
  3. Edit ツールで `status:` 行のみを `status: done` に置換
     - old_string は `status: <現在値>` 1行だけ
     - new_string は `status: done`
     - priority / reported / source / parent / depends / summary / 本文は一切触らない
  4. `git add issues/1020-1013-subtask*.md` の後、`git diff --cached` で以下を確認:
     - 変更は status 行 1行のみ (-1 +1)
     - YAML `---` 区切りが破損していない
     - コロン位置・インデントが正常
  5. `git commit -m "chore(issues): mark 1020-1013-subtask as done"` でコミット
  6. lint/test/build は不要 (issues/ 配下の md のみの変更)
  7. `git mv` 禁止・ファイル名変更禁止

  注意事項:
  - 対象ファイルが 0 件 または 2 件以上の場合は中断してユーザーに報告
  - frontmatter 外の本文に `status:` という文字列があっても書き換えない（Edit で先頭の frontmatter ブロック内の行をピンポイント指定）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
