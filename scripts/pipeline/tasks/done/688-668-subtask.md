---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 668-663-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 668-663-graphviewcontainer-ts-claude-md-ratchet)

`★ Insight ─────────────────────────────────────`
- この issue は「1コミット集約必須」が明示されているため、複数サブタスクへの分解は制約違反。単一タスクに保つのが正解
- ratchet down 原則: N >= 8597 なら CLAUDE.md は無変更、N < 8597 のときだけ更新 — 測定値次第で分岐する atomic 操作
- `git mv` + Edit + commit を1セッションで完結させることで「pending → done リネーム」を `--diff-filter=R` で検出可能にする
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
