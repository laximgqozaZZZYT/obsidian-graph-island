---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 690-687-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issueファイルを特定しfrontmatterをstatus:doneに編集
---

## Description (subtask of 690-687-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定
  2. 0件なら Glob `issues/done/*639-626*subtask*.md` で done済み確認 → あれば no-op 終了 (コミットもスキップ)
  3. 複数候補があれば frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系のものを採用
  4. Read で対象ファイル全体を取得
  5. Edit で frontmatter の `status: decomposed` を `status: done` に変更。他フィールド (priority/reported/parent/depends/summary/source) と本文は一切触らない
  6. basenameを記録 (例: `639-626-subtask-xxx.md`)
  7. lint/test/build は実行しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
