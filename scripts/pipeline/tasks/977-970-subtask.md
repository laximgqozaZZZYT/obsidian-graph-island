---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 970-954-639-626-subtask-issue-frontmatter-status
depends: none
summary: subtask
---

## Description (subtask of 970-954-639-626-subtask-issue-frontmatter-status)

`★ Insight ─────────────────────────────────────`
- このissueは「1ファイル1行の置換 + 1コミット」という最小単位の操作で、既に`max-turns 30`の1セッションで完結可能なサイズです
- 分解ルール5「最大5タスク」は上限であり、原子的な操作を無理に分割すると調整コストが増えて逆効果になります
- Glob候補のフォールバック (pending→done) は同じセッション内で判断すべきロジックで、切り離すとセッション間の状態共有が必要になります
`─────────────────────────────────────────────────`

この issue は既に原子的で、1セッションで完結できる最小サイズです。分解せず単一タスクとして出力します。

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
