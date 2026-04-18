---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 629-617-594-done-graphviewcontainer-ts
depends: none
summary: subtask
---

## Description (subtask of 629-617-594-done-graphviewcontainer-ts)

の CURRENT_LOC と比較する。
  - CURRENT_LOC > 8597: FAIL として報告し、本タスクを done に遷移させない。
  - CURRENT_LOC == 8597: PASS (変化なし、done 可)。
  - CURRENT_LOC < 8597: PASS かつ `RATCHET_CANDIDATE=<CURRENT_LOC>` を記録
    (次サブタスクで CLAUDE.md ratchet down に使用)。
  CLAUDE.md 本体の編集はこのサブタスクでは行わない (read-only 検証)。
  新規ファイル追加・既存ファイル編集禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
