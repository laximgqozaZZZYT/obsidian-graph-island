---
priority: medium
reported: 2026-04-15
status: in-progress
source: decomposed
parent: 133-type-assertions
depends: none
summary: subtask
---

## Description (subtask of 133-type-assertions)

分布を把握しました。実際の型アサーションは199箇所、パターン別に分類できます。以下がタスク分解です。

---

`★ Insight ─────────────────────────────────────`
- `as unknown as Record<string, unknown>` が21箇所 — PanelStateへの動的キーアクセスが主因。型安全なヘルパー関数で一掃可能
- `as HTML*Element` が57箇所 — DOM APIの戻り値型が原因。`querySelector<T>` ジェネリックで約半数は解消可能、残りはDOM境界で不可避
- enum-like キャスト（NodeShape, ClusterArrangement等）が約20箇所 — 型ガード関数で置換可能
`─────────────────────────────────────────────────`

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
