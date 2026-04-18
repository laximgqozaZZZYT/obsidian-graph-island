---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 811-802-git-status-short-tmp-git-status-short-tx
depends: none
summary: git status --short を実行し /tmp/git-status-short.txt に保存・検証
---

## Description (subtask of 811-802-git-status-short-tmp-git-status-short-tx)

/home/ubuntu/obsidian-plugins/obsidian-graph-island をワーキングディレクトリとして:

  1. `git status --short > /tmp/git-status-short.txt 2>&1; echo "EXIT=$?"` を実行
  2. 出力の "EXIT=" 値が 0 であることを確認 (非0なら即座に失敗報告して終了)
  3. `wc -l /tmp/git-status-short.txt` が成功し、ファイルが読み取り可能であることを確認
  4. `head -50 /tmp/git-status-short.txt` で内容を一覧し、ログに残す

  禁止事項 (厳守):
  - git mv / git add / git commit / git restore / git checkout / git reset 等の state 変更コマンド一切禁止
  - src/ 配下のファイル編集禁止 (Read のみ許可)
  - 新規ファイル作成は /tmp/ 配下のみ許可

  Acceptance:
  - [ ] git status --short の exit code が 0
  - [ ] /tmp/git-status-short.txt が生成済み
  - [ ] `wc -l /tmp/git-status-short.txt` が成功
  - [ ] 作業ツリーの変更が発生していない (`git status` 前後で差分なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
