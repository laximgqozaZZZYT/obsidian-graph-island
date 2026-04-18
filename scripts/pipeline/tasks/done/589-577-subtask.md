---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 577-567-subtask
depends: none
summary: subtask
---

## Description (subtask of 577-567-subtask)

`★ Insight ─────────────────────────────────────`
- 元issue自身が「既にatomic・コード変更なし・空コミットのみ」と明記しているため、これ以上の分解は人工的オーバーヘッドとなります。
- GOD OBJECTポリシーの "ratchet down only" ルール検証タスク。`GraphViewContainer.ts` の現在行数が上限8597を超えていないかを確認するだけの守りのタスクです。
- 1サブタスクとしてそのまま出力し、`wc -l` 検証 + 空コミットで完結させます。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
