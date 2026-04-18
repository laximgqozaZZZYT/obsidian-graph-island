---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 856-737-status-line-count-verify
depends: subtask-1
summary: Grep で status 行を列挙し done=1 / decomposed=0 を検証
---

## Description (subtask of 856-737-status-line-count-verify)

1. Grep (path=subtask-1 で特定したファイル, pattern=`^status:`, output_mode=content, -n=true) で全 status 行を列挙
  2. 検証条件:
     - `status: done` が frontmatter 内に **1箇所だけ**
     - `status: decomposed` が frontmatter 内に **0箇所**
     - status 行の総数が 1 であること (重複行の二重挿入を検出)
  3. いずれかの条件が満たされない場合、親タスク 702-691-edit-status のバグとして FAIL を報告 (行番号と実際の値を含める)
  4. 全条件満たせば PASS 報告
  5. コード編集は一切行わない (read-only verification)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
