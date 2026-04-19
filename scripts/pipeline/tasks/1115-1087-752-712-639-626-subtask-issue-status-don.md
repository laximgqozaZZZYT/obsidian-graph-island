---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1087-1066-752-712-639-626-subtask-issue-pending-do
depends: none
summary: 752-712-639-626-subtask-issue-status-done-git-mv.md を pending→done に移動 + status:done 化 + 1コミット
---

## Description (subtask of 1087-1066-752-712-639-626-subtask-issue-pending-do)

不可分な原子操作として1セッションで完了。

  手順:
  1. `git mv .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md`
  2. Edit ツールで done 側ファイルの frontmatter `status: in-progress` を `status: done` に 1 行のみ書き換え（priority/reported/parent/depends/summary/source は変更しない）
  3. `git status` で次の 3 変更が 1 セットに入っていることを確認:
     - pending/752-712-639-626-subtask-issue-status-done-git-mv.md 削除
     - done/752-712-639-626-subtask-issue-status-done-git-mv.md 追加
     - done 側 status 行変更
  4. `git add .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md` で対象 2 ファイルのみ明示 add（`git add -A`/`git add .` 禁止）
  5. `git commit -m "chore: done 752-712-639-626-subtask-issue-status-done-git-mv.md" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"` で 1 コミット作成

  制約:
  - 他の issue ファイルには触らない
  - コード変更・テスト追加なし（God Object 非対象、CLAUDE.md ルール準拠）
  - `location.reload()` 等の禁止パターン無関係（ドキュメント操作のみ）

  受け入れ基準:
  - pending から元ファイルが消え done へ移動
  - done 側ファイルの status が `done`
  - 3 変更が 1 コミットに収まる
  - コミットメッセージ末尾に Co-Authored-By 行あり

`★ Insight ─────────────────────────────────────`
`git mv` は「削除+追加」を1操作で index に記録するため、ステップ4の明示 add では両パスを指定する必要があります（mv しただけでは status 行の編集分は unstaged のまま残る点に注意）。
`git add -A` を禁じている理由は、CLAUDE.md の "prefer adding specific files by name" 方針と、パイプライン実行中に他 issue の自動変更が混入するのを防ぐためです。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
