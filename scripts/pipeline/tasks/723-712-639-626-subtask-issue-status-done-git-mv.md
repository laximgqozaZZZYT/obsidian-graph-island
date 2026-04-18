---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 712-699-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv で単一コミット
---

## Description (subtask of 712-699-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定する。
     - 0件なら Glob `issues/done/*639-626*subtask*.md` を確認し、done 済みなら no-op 終了 (exit 0) とする。
     - 複数件マッチした場合は frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系であるものを選択。候補が曖昧なら中止してユーザーに報告。
  2. Read で対象ファイル全体を確認。Edit で frontmatter の `status: pending` または `status: in-progress` を `status: done` に書き換える。
     priority/reported/parent/depends/summary/source および本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行 (rename 検出のため mv → edit の順ではなく、edit 済みの状態で git mv)。
  4. `git status` を実行し、差分が「pending 側の delete + done 側の add (= rename) + status フィールドの modify」のみであることを確認。他ファイルに差分があれば即中止。
  5. `git add -A && git commit -m "chore: done <filename>"` でコミット (`<filename>` は拡張子なしベース名)。
  6. 検証:
     - `git status` がクリーンであること
     - `git log -1 --pretty=%s` が commit message と一致すること
     - `ls issues/done/<filename>.md` が存在すること
  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 等は一切変更しない
  - lint/test/build 実行不要
  - God Object ファイル (GraphViewContainer.ts 等) には触れない
  - 作業対象は issues/ ディレクトリのみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
