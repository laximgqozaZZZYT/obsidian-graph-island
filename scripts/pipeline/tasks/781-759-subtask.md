---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 759-730-edit-read-frontmatter
depends: none
summary: subtask
---

## Description (subtask of 759-730-edit-read-frontmatter)

`★ Insight ─────────────────────────────────────`
- この issue は「既に Edit 済みのファイルが正しく書き込まれたか」を検証する verification 系タスクで、実装というよりアサーション手続きに近いです。
- `depends: subtask-1` の設計は、subtask-1 が「書き込んだ値」を記録し、subtask-2 がそれを照合する契約になっており、状態共有のない claude -p セッション間で引き継ぐには記録ファイル(例: `.baseline.json`) が鍵になります。
- God Object 肥大化の回避が CLAUDE.md の一級ルールであることを踏まえ、この verification スクリプトは `src/` 本体ではなく `scripts/` または autonomous pipeline 側に置くのが適切です。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
