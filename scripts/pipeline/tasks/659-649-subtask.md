---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 649-630-claude-md-ratchet-down-issue-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 649-630-claude-md-ratchet-down-issue-done-git-mv)

`★ Insight ─────────────────────────────────────`
- このissueは本質的に**アトミック**（1コミットに集約要件あり）。Step 1-5を分割すると再測定が必要になり、行数 N の一貫性が壊れる。
- `ratchet down only` は一方向制約の典型例。N >= 8597 時に CLAUDE.md を無変更にするガード条項で、誤った増加方向更新（劣化）を構造的に防いでいる。
- `git mv` は `rm + add` を1オペレーションに変換し git に履歴追跡を明示させる。pending/done の状態遷移を履歴的に可視化する設計。
`─────────────────────────────────────────────────`

元のissueは「1コミット集約」要件があり、Step 1-5 は全て output→input 依存で密結合しているため、分割は不適切です。単一SUBTASKとして出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
