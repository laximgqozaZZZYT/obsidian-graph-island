---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 658-639-subtask-issue-status-done
depends: none
summary: subtask issue ファイルを done に更新し git mv でコミット
---

## Description (subtask of 658-639-subtask-issue-status-done)

1. Glob で `issues/pending/*639-626*subtask*.md` (本 issue の subtask-3 に相当するファイル) を特定する。複数ある場合は summary が「subtask issueのstatusをdoneに更新しコミット」と一致するものを選択。
  2. Edit で frontmatter の `status: pending` または `status: in-progress` を `status: done` に書き換え。他フィールド (priority/reported/parent/depends/summary) は変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` で移動。
  4. `git add -A` 後、`git commit -m "chore: done <filename> — GVC test report appended"` でコミット。
  5. 実装コード (src/**) は一切変更しない。GOD OBJECT ポリシー・カバレッジ閾値・bundle size への影響なし。lint/test の実行も不要 (ドキュメント変更のみ)。
  6. 検証: `git status` でクリーン、`git log -1` で期待するコミットメッセージを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
