---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 703-694-subtask
depends: none
summary: subtask
---

## Description (subtask of 703-694-subtask)

`★ Insight ─────────────────────────────────────`
- この issue は self-describing な「分解禁止」マーカーを持っています。`parent: 694-650-graphviewcontainer-ts-claude-md-ratchet` で示される親タスクは CLAUDE.md の God Object ratchet（行数しきい値の切り下げ）であり、「ファイル行数測定 → ratchet 値更新」がアトミックに1コミットで行われないとリポジトリ状態（実際の行数 vs 宣言された Max Allowed）が乖離します。
- CLAUDE.md の "Ratchet down only" ポリシーは、`GraphViewContainer.ts: 8597 / Max Allowed: 8597` のような境界値ケースで特にクリティカル。測定と宣言を別コミットに分けると、間の瞬間に「実測 < 宣言」状態が生じ、気づかないうちに肥大化する余地が生まれます。
- したがって分解せず、1タスク=1 claude -p セッション=1コミット として扱うのが正解です。
`─────────────────────────────────────────────────`

元 issue の宣言通り、分解せず単一タスクとして返します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
