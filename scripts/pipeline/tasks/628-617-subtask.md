---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 617-593-594-585-done
depends: none
summary: subtask
---

## Description (subtask of 617-593-594-585-done)

`★ Insight ─────────────────────────────────────`
- この親タスクは「検証 + ステータス遷移」のみで、GraphViewContainer.ts 本体編集禁止。read-only中心のため小さく分解可能
- CLAUDE.md の GOD OBJECT Policy は "ratchet down only" (現在値より減らす方向のみ更新可) — 肥大化は絶対禁止
- 検証(lint/test)と遷移(ファイル移動/コミット)は性質が違う(前者:失敗可能性あり、後者:副作用あり)ので分けるのが安全
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
