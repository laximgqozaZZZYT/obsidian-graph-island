---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 737-721-issue-frontmatter-status-done
depends: none
summary: 保持フィールド (priority/reported/parent/depends/summary/source) の存在検証
---

## Description (subtask of 737-721-issue-frontmatter-status-done)

親タスク 702-691-edit-status で編集された issue ファイルについて、
編集前から存在する保持フィールドが失われていないかを検証する (read-only)。

手順 (各フィールドを Grep で個別確認):
1. Grep pattern=`^priority:` → 1件存在
2. Grep pattern=`^reported:` → 1件存在
3. Grep pattern=`^parent:` → 1件存在
4. Grep pattern=`^depends:` → 1件存在
5. Grep pattern=`^summary:` → 1件存在
6. Grep pattern=`^source:` → 1件存在

いずれかが欠落していたら親タスクの編集にバグがあるため FAIL を報告。
コード編集は行わない (read-only verification)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
