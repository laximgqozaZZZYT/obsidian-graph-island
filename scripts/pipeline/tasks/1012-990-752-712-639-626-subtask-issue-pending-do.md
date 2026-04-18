---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 990-866-issue-pending-done-git-mv-status-done
depends: none
summary: 752-712-639-626-subtask issue を pending→done へ git mv + status:done 化 + 1コミット
---

## Description (subtask of 990-866-issue-pending-done-git-mv-status-done)

手順:
  1. `git mv .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md`
  2. 移動先ファイル `.claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md` の frontmatter を Edit ツールで
     `status: in-progress` → `status: done` に書き換え (1行のみ)
  3. `git status` で以下3点が1コミット内にあることを確認:
     - pending/752-712-639-626-subtask-issue-status-done-git-mv.md の削除
     - done/752-712-639-626-subtask-issue-status-done-git-mv.md の追加
     - done側 frontmatter の status 行変更
  4. `git add` + `git commit -m "chore: done 752-712-639-626-subtask-issue-status-done-git-mv.md" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"` で1コミット

  制約:
  - 他の issue ファイルは触らない
  - frontmatter の他フィールド (priority/reported/parent/depends/summary/source) は変更しない
  - コード変更なし、テスト追加不要 (God Object 非対象、CLAUDE.md ルール準拠)
  - `git add -A` や `git add .` は使用せず、対象2ファイルのみを明示的に add

  受け入れ基準:
  - [ ] pending ディレクトリから元ファイルが消え、done ディレクトリに移動している
  - [ ] done 側ファイルの status が `done` になっている
  - [ ] 上記3変更が1コミットに収まっている
  - [ ] コミットメッセージ末尾に Co-Authored-By 行がある

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
