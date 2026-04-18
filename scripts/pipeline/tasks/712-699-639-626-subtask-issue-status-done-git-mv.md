---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 699-678-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv でコミット
---

## Description (subtask of 699-678-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイル特定。frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系のもの。
     0件なら Glob `issues/done/*639-626*subtask*.md` を確認し、done 済みなら no-op 終了 (exit 0)。
  2. Read で対象ファイル全体を確認。Edit で frontmatter `status: pending` または `status: in-progress` を `status: done` に書き換える。
     priority/reported/parent/depends/summary/source および本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  4. `git status` で「pending delete + done add + status modify (= rename+変更) のみ」であることを確認。他ファイルに差分があれば中止。
  5. `git add -A && git commit -m "chore: done <filename>"` でコミット (`<filename>` は拡張子なしベース名)。
  6. src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs 等は一切変更しない。lint/test/build 実行不要。
  7. 検証: `git status` クリーン / `git log -1 --pretty=%s` が commit message と一致 / `ls issues/done/<filename>.md` 存在確認。
  制約: God Object ファイル(GraphViewContainer.ts 等)には触れない。この作業は issues/ ディレクトリのみを対象とする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
