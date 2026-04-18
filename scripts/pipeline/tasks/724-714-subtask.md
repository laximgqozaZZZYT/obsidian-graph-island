---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 714-704-graphviewcontainer-claude-md-ratchet-617
depends: none
summary: subtask
---

## Description (subtask of 714-704-graphviewcontainer-claude-md-ratchet-617)

`★ Insight ─────────────────────────────────────`
- この issue は既に「観測→条件分岐→状態遷移」の3ステップ構造で、単一の claude -p セッション（30ターン制限）に余裕で収まります。さらに分解するとコミット粒度が細かくなりすぎて逆効果。
- ratchet down only ポリシーは God Object の「行数単調減少」を git 履歴で証跡化する仕組みで、CLAUDE.md 自体が品質ゲートとして機能する典型パターンです。
`─────────────────────────────────────────────────`

この issue は既に最小粒度で、claude -p 1セッションで完結するサイズです。分解せず1タスクとして出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
