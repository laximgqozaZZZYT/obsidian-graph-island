---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1009-988-subtask
depends: none
summary: issue の status を done に更新し pending→done へ git mv
---

## Description (subtask of 1009-988-subtask)

親 issue (988-928-639-626-subtask-issue-pending-done-git-m) の完了処理を 1 セッション・1 コミットで実施する原子的操作。

  手順:
  1. `issues/pending/988-928-639-626-subtask-issue-pending-done-git-m.md` の frontmatter `status: in-progress` を `status: done` に書き換え
  2. `git mv issues/pending/988-928-639-626-subtask-issue-pending-done-git-m.md issues/done/` で done/ 配下へ移動
  3. `git commit -m "chore: close 988-928-639-626-subtask-issue-pending-done-git-m"` で単一コミットを作成

  制約:
  - frontmatter の他フィールド (priority/reported/source/parent/depends/summary) は変更しない
  - Description 本文は変更しない
  - 他ファイルへの変更は一切含めない (純粋な issue ライフサイクル操作)
  - CLAUDE.md ルール: God Object 不変更、`location.reload()` 不使用、コード変更なしのためテスト実行不要

  受入基準:
  - [ ] `issues/done/988-928-639-626-subtask-issue-pending-done-git-m.md` が存在し `status: done`
  - [ ] `issues/pending/988-928-639-626-subtask-issue-pending-done-git-m.md` が存在しない
  - [ ] `git log -1` の差分が frontmatter 1 行 + rename のみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
