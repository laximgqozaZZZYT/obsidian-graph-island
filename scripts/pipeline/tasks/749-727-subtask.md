---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 727-715-graphviewcontainer-ratchet-issue-done
depends: none
summary: subtask
---

## Description (subtask of 727-715-graphviewcontainer-ratchet-issue-done)

★ Insight ─────────────────────────────────────
この issue は本質的に「測定 → CLAUDE.md ratchet → issue done化 → 単一コミット」の一連の流れで、要件として「単一コミット」が明示されています。複数 subtask に分けると複数コミットになり要件違反になるため、1 タスクに集約します。
`tests/`・`src/` への変更が一切ないため、サイズ的にも 1 セッション (max-turns 30) で十分完了可能です。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
