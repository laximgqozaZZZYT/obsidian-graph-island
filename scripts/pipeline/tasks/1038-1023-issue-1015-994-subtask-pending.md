---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1023-1015-pending-done-git-mv-frontmatter-status
depends: none
summary: 親issue 1015-994-subtask が参照する対象pendingファイルを特定
---

## Description (subtask of 1023-1015-pending-done-git-mv-frontmatter-status)

`.claude/issues/pending/1015-994-subtask.md` を読み、本文内で言及されている「対象 issue ファイル」のファイル名を特定する。
  - ファイル名を結果として出力（例: `.claude/issues/pending/XXXX.md`）
  - 該当ファイルが `.claude/issues/pending/` に存在することを `ls` 相当で確認
  - frontmatter の現在の `status` 値も記録
  このタスクはコミットなし、調査のみ。ソースコードには触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
