---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 737-721-issue-frontmatter-status-done
depends: none
summary: 編集後ファイルの status 行が「status: done」1箇所のみであることを検証
---

## Description (subtask of 737-721-issue-frontmatter-status-done)

親タスク 702-691-edit-status で編集された issue ファイルについて、
status 行の件数と値を検証する (read-only)。

手順:
1. 対象ファイルの冒頭 30 行を Read (offset=0, limit=30) で取得し frontmatter を特定
2. Grep (path=同ファイル, pattern=`^status:`) で status 行をカウント
3. 次の条件を検証:
   - `status: done` が frontmatter 内に **1箇所だけ** 存在
   - `status: decomposed` (編集前の値) が frontmatter 内に **存在しない**

いずれかの条件が満たされない場合、親タスクの編集にバグがあるため FAIL を報告。
コード編集は行わない (read-only verification)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
