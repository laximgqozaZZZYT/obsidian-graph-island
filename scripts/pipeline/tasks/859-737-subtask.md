---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 737-721-issue-frontmatter-status-done
depends: none
summary: subtask
---

## Description (subtask of 737-721-issue-frontmatter-status-done)

で frontmatter が正しく更新されていることを確認した後、
  元のフィールドが保持されているかを検証する。
  
  手順 (各フィールドを Grep で個別確認):
  1. Grep pattern=`^priority:` → 1件存在
  2. Grep pattern=`^reported:` → 1件存在
  3. Grep pattern=`^parent:` → 1件存在
  4. Grep pattern=`^depends:` → 1件存在
  5. Grep pattern=`^summary:` → 1件存在
  6. Grep pattern=`^source:` → 1件存在
  
  いずれかが欠落していたら親タスクの編集にバグがあるため FAIL を報告。
  read-only verification のため、コード編集は行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
