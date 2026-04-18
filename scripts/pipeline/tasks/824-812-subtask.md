---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 812-802-repository-state
depends: none
summary: subtask
---

## Description (subtask of 812-802-repository-state)

`★ Insight ─────────────────────────────────────`
このタスクは既に「subtask-2 (検証ゲート)」として最小粒度まで分解済みで、2つの `git` コマンド実行と exit code チェックのみで構成されています。さらに分解すると CLEAN チェックと MATCH チェックを別セッションに分けることになりますが、それぞれが単独だと意味を持たない (両方揃って初めて "state 未変更契約" が成立) ため、これ以上の分解は価値を生みません。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
