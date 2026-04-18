---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 702-691-edit-status
depends: none
summary: subtask
---

## Description (subtask of 702-691-edit-status)

で編集したファイルを Read ツールで offset=0, limit=30 で再読込。
  2. frontmatter セクション (`---` から `---` の間) に `status: done` が1箇所だけ存在することを確認。
  3. `status: pending` および `status: in-progress` が frontmatter に残存していないことを確認。
  4. priority / reported / parent / depends / summary / source フィールドが元のまま保持されていることを目視確認。
  5. 検証に失敗した場合は具体的な差分を報告し、

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
