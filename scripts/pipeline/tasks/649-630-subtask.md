---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 630-617-claude-md-max-allowed-ratchet-down-issue
depends: none
summary: subtask
---

## Description (subtask of 630-617-claude-md-max-allowed-ratchet-down-issue)

`★ Insight ─────────────────────────────────────`
- このissueは既にsubtask-1の検証完了を前提とした「write-only」最小タスクで、かつ「変更を1コミットに集約」が要件に含まれています。これ以上分解すると1コミット制約に違反します。
- ratchet-down制約(減少方向のみ更新)は、god object肥大化を防ぐプロジェクト憲法(CLAUDE.md)の核となる不可逆ガードレールです。同値なら無変更が正解。
- `git mv` を使うのはrename履歴を保つため。`rm`+`add`で履歴が分断されると、なぜdone遷移したかの追跡が難しくなります。
`─────────────────────────────────────────────────`

このissueは既に「1コミット・1セッション」で完結する最小タスクです。分解すると1コミット制約に反するため、単一SUBTASKとして出力します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
