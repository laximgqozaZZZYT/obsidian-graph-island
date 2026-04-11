---
priority: medium
reported: 2026-04-11
status: in-progress
source: decomposed
parent: 093-perf-animation-smoothness
depends: none
summary: subtask
---

## Description (subtask of 093-perf-animation-smoothness)

全体像が把握できました。以下がタスク分解です。

---

`★ Insight ─────────────────────────────────────`
**根本原因**: Canvas2D バックエンド（デフォルト）は `supportsAnimation = false` を返す。GVC の全アニメーション（ズームイージング、レイアウト遷移、フォーカスズーム、パン）がこのフラグで分岐し、Canvas2D では即座にジャンプする。CPU描画でもrAFベースのアニメーションは十分軽量なのに、一律スキップしている。
加えて `InertiaPan` クラスは実装済みだがどこからも使われていない。
`─────────────────────────────────────────────────`

---

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
