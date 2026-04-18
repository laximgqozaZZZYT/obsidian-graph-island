---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 663-660-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 663-660-graphviewcontainer-ts-claude-md-ratchet)

元のissueが明示的に「1コミット集約必須のため分割不可」「単一アトミックタスク」と宣言しているため、意味のある分解はできません。wc -l測定 → CLAUDE.md条件付き更新 → issue status遷移 → git mv → 1コミットは不可分な原子操作です。

そのまま単一タスクとして出力します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
