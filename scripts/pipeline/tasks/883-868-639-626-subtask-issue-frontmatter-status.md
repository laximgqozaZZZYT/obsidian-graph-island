---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 868-743-639-626-subtask-issue-status-done
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新
---

## Description (subtask of 868-743-639-626-subtask-issue-status-done)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定
  2. 0件なら Glob `issues/done/*639-626*subtask*.md` で確認
     - ヒット = 既に done 済み → no-op 終了（コミットもしない）
     - 両方 0件 → エラー報告して終了
  3. 複数候補の場合は frontmatter `summary` が「subtask issueのstatusをdoneに更新しコミット」系のものを採用
  4. Read で対象ファイル全体を取得
  5. Edit で frontmatter の `status: in-progress` を `status: done` に 1行だけ置換
     - priority/reported/parent/depends/summary/source と本文は一切触らない
  6. basename を記録（例: `639-626-subtask-xxx.md`）
  7. lint/test/build は **実行しない**
  8. 変更が発生した場合のみ `git add <path> && git commit -m "chore: done <basename>"` 形式でコミット
  9. 変更なし（既に done）の場合はコミットもスキップ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
