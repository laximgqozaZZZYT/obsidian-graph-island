---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 721-702-subtask
depends: none
summary: subtask
---

## Description (subtask of 721-702-subtask)

で検証に失敗した場合のみ実行する報告タスク。

  報告内容:
  1. どのチェック項目が失敗したか (status 重複 / pending 残存 / フィールド欠落 など)
  2. frontmatter の現在の内容 (Read 結果の該当行を引用)
  3. 期待される内容との差分を `- expected` / `+ actual` 形式で列挙
  4. 親タスク 702-691-edit-status の再実行が必要か否かの判定

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
