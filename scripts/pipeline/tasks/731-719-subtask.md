---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 719-702-frontmatter-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 719-702-frontmatter-status-done-edit)

`★ Insight ─────────────────────────────────────`
- 元issueは既に「status行1行の置換」という原子的操作まで絞られたサブタスクなので、さらに細かく割ると1ターンで済む作業を分断してオーバーヘッドが増える
- frontmatter編集は「読む→置換」が不可分（old_stringの正確な取得が前提）なので、Read+Editは同一セッションに留めるのが健全
- 検証はgit diffで「status行以外が変化していないこと」を確認する独立タスクとして分けると、パイプラインの品質ゲートとして機能する
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
