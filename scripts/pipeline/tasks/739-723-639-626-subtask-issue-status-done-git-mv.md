---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 723-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化し git mv で単一コミット
---

## Description (subtask of 723-712-639-626-subtask-issue-status-done-git-mv)

作業対象は issues/ ディレクトリのみ。src/**, tests/**, 設定ファイル、God Object には触れない。

  1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定。
     - 0件なら Glob `issues/done/*639-626*subtask*.md` を確認、done 済みなら no-op 終了 (exit 0)。
     - 複数件マッチした場合は frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系であるものを選択。候補が曖昧なら中止してユーザーに報告。
  2. Read で対象ファイル全体を確認。Edit で frontmatter の `status: pending` または `status: pending` を `status: done` に書き換える。priority/reported/parent/depends/summary/source および本文は一切変更しない。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行 (edit 済みの状態で mv、rename 検出のため)。
  4. `git status` を実行し、差分が pending 側 delete + done 側 add (= rename) + status フィールドの modify のみであることを確認。他ファイルに差分があれば即中止。
  5. `git add -A && git commit -m "chore: done <filename>"` でコミット (拡張子なしベース名)。
  6. 検証: `git status` クリーン / `git log -1 --pretty=%s` がメッセージ一致 / `ls issues/done/<filename>.md` 存在。
  lint/test/build は実行不要。

`★ Insight ─────────────────────────────────────`
- 単一 SUBTASK に留めた理由: acceptance criteria (commit 成立 + git status クリーン) が1コミット単位でしか検証できないため
- `git mv` はファイル内容を変更しない — edit を先に行ってから mv することで Git の rename 検出が働き、履歴が綺麗になる
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
