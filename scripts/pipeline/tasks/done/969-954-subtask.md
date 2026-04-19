---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 954-943-639-626-subtask-issue-frontmatter-status
depends: none
summary: subtask
---

## Description (subtask of 954-943-639-626-subtask-issue-frontmatter-status)

`★ Insight ─────────────────────────────────────`
- この issue は既に 1 セッションで完結可能な粒度 (frontmatter 1行変更 + 1コミット)。過剰分解は逆にオーバーヘッドを生む
- 「0件時の fallback (done/ 配下確認)」「複数候補時の優先ルール」など分岐が既に明文化されているため、単一タスクで安全に処理できる
- ファイル探索→編集→コミットは依存関係が直線的で、並列化の余地なし
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
