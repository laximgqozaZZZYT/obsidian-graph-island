---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 725-714-graphviewcontainer-claude-md-ratchet-617
depends: subtask-2
summary: CLAUDE.md の GOD OBJECT Policy 表を ratchet down (条件付き)
---

## Description (subtask of 725-714-graphviewcontainer-claude-md-ratchet-617)

subtask-2 の判定に従って CLAUDE.md を条件付きで更新する。

  手順:
  - N < 8597 の場合のみ:
    - Edit tool で `| src/views/GraphViewContainer.ts | 8597 | 8597 |` の両方の 8597 を N に置換
    - Max Allowed は絶対に増やさない (ratchet down only)
  - N >= 8597 の場合: 何もせず次タスクへ進む

  制約:
  - Max Allowed の増加方向更新は絶対禁止
  - CLAUDE.md 以外のファイル編集禁止
  - コミットは作らない (subtask-5 で単一コミット化)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
