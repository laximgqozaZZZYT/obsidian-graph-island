---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1012-990-752-712-639-626-subtask-issue-pending-do
depends: none
summary: 752-712-639-626-subtask issue を pending→done へ git mv + status:done 化 + 1コミット
---

## Description (subtask of 1012-990-752-712-639-626-subtask-issue-pending-do)

手順:
  1. `git mv .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md`
  2. Edit ツールで `.claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md` の frontmatter `status: decomposed` を `status: done` に 1 行のみ書き換え
  3. `git status` で以下3点が同一変更内にあることを確認:
     - pending/752-712-639-626-subtask-issue-status-done-git-mv.md の削除
     - done/752-712-639-626-subtask-issue-status-done-git-mv.md の追加
     - done 側 frontmatter の status 行変更
  4. `git add .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md` で対象 2 ファイルのみを明示 add
  5. `git commit -m "chore: done 752-712-639-626-subtask-issue-status-done-git-mv.md" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"` で 1 コミット

  制約:
  - 他の issue ファイルには触らない
  - frontmatter の priority/reported/parent/depends/summary/source は変更しない
  - コード変更・テスト追加なし (God Object 非対象、CLAUDE.md ルール準拠)
  - `git add -A` / `git add .` は使用禁止

  受け入れ基準:
  - pending から元ファイルが消え done へ移動している
  - done 側ファイルの status が `done` になっている
  - 3 変更が 1 コミットに収まっている
  - コミットメッセージ末尾に Co-Authored-By 行がある

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
