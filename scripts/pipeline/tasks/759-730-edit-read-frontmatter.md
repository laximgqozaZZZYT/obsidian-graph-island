---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 730-717-status-done-edit
depends: subtask-1
summary: Edit 後に Read で frontmatter と本文の完全性を検証
---

## Description (subtask of 730-717-status-done-edit)

1. Read ツールで対象ファイルを再読込。
  2. 以下を検証 (不一致なら ERROR 出力):
     - `status: done` になっている
     - `priority` / `reported` / `parent` / `depends` / `summary` / `source` が
       subtask-1 で記録した値と完全一致
     - `## Description` 以降の本文が subtask-1 で記録した内容と完全一致
       (行数・空白・wiki-link すべて含めて diff=0)
  3. すべて PASS したら成功報告。1つでも不一致なら Edit をロールバックする指示を出す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
