---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 662-658-subtask-issue-done-git-mv
depends: none
summary: 639-626 subtask issue ファイルを status:done 化して git mv でコミット
---

## Description (subtask of 662-658-subtask-issue-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定する。
     複数ヒットした場合は frontmatter の `summary` が「subtask issueのstatusをdoneに更新しコミット」に一致するものを選ぶ。
     0件ならすでに done 済みの可能性があるため `issues/done/*639-626*subtask*.md` を確認し、done 済みなら no-op として報告して終了。
  2. Read でファイル全体を確認し、Edit で frontmatter の `status: pending` または `status: in-progress` を `status: done` に書き換える。
     `priority` / `reported` / `parent` / `depends` / `summary` / `source` など他のフィールドは一切変更しない。本文 (Description/Acceptance criteria) も触らない。
  3. Bash で `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で pending 側 delete と done 側 add + status フィールドの modify のみ出ていることを確認。
  5. `git add -A` の後、`git commit -m "chore: done <filename> — GVC test report appended"` でコミット。
     `<filename>` は拡張子なしのベース名を使用 (例: `639-626-subtask-...`)。
  6. src/** やテスト・設定ファイルは一切変更しない。lint/test/build は実行不要。
  7. 検証: `git status` がクリーン、`git log -1 --pretty=%s` で期待コミットメッセージ一致、`ls issues/done/<filename>.md` で移動後ファイル存在を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
