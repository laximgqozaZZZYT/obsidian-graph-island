---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 823-811-git-status-short-tmp-git-status-short-tx
depends: none
summary: subtask-2〜4 の共有前提条件 (作業ディレクトリ/禁止コマンド/成果物パス) を宣言
---

## Description (subtask of 823-811-git-status-short-tmp-git-status-short-tx)

以降の subtask-2〜4 が従う共通前提を固定する:

  - 作業ディレクトリ: `/home/ubuntu/obsidian-plugins/obsidian-graph-island`
  - 成果物パス: `/tmp/git-status-short.txt` (新規ファイル作成は `/tmp/` 配下のみ許可)
  - 禁止コマンド: `git add` / `git commit` / `git mv` / `git restore` / `git checkout` / `git reset` 等 state 変更系一切
  - src/ 配下: Read のみ許可、書き込み禁止
  - 各 subtask は前段の成果物 (EXIT=0 のログ、`/tmp/git-status-short.txt` の存在) に依存するため順序厳守

subtask-2〜4 はこの前提を参照して作業する。このタスク自体はコード実行を伴わず、状態確認のみで完了してよい。

## Acceptance criteria
- [ ] 作業ディレクトリが `/home/ubuntu/obsidian-plugins/obsidian-graph-island` であること (`pwd` で確認)
- [ ] 直前の `git status` 出力に想定外の untracked / modified が無いこと
