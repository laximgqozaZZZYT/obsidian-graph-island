---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1066-1049-752-712-639-626-subtask-issue-pending-do
depends: none
summary: 752-712-639-626-subtask issue を pending→done に git mv + status:done 化 + 1コミット
---

## Description (subtask of 1066-1049-752-712-639-626-subtask-issue-pending-do)

原子操作(分解禁止)。単一 claude -p セッション (max-turns 30) で以下を順に実行:

  1. `git mv .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md`
  2. Edit ツールで done 側ファイルの frontmatter `status: in-progress` のみを `status: done` に書き換え。priority / reported / parent / depends / summary / source の各行は一切変更しない。
  3. `git status` で次の3変更のみが staged/unstaged にあることを確認:
     - pending/752-712-639-626-subtask-issue-status-done-git-mv.md の削除
     - done/752-712-639-626-subtask-issue-status-done-git-mv.md の追加
     - done 側 status 行の変更
  4. `git add .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md` で対象2ファイルのみ明示 add。`git add -A` / `git add .` は禁止。
  5. `git commit -m "chore: done 752-712-639-626-subtask-issue-status-done-git-mv.md" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"` で1コミット作成。

  制約:
  - 他の issue ファイル・コード・テストには一切触らない
  - God Object 非対象、CLAUDE.md ルール準拠(コード変更なし)
  - コミットは必ず1つ、Co-Authored-By 行を末尾に含める

  受け入れ基準:
  - pending から元ファイルが消え、done へ移動している
  - done 側ファイルの status が `done`
  - 上記3変更が1コミットに収まっている
  - コミットメッセージ末尾に Co-Authored-By 行がある

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
