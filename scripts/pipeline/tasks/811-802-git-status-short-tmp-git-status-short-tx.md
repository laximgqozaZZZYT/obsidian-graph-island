---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 802-769-git-status-short
depends: none
summary: git status --short を実行し /tmp/git-status-short.txt に生出力を保存
---

## Description (subtask of 802-769-git-status-short)

/home/ubuntu/obsidian-plugins/obsidian-graph-island にて以下を実行:
  1. `git status --short > /tmp/git-status-short.txt 2>&1; echo "EXIT=$?"`
  2. EXIT=0 を確認 (非0なら即エラー報告して終了)
  3. `/tmp/git-status-short.txt` が生成され、読み取り可能であること確認
  4. git mv / git add / git commit / git restore 等の state 変更コマンドは一切実行しない
  5. src/ 配下のファイルは touch しない
  Acceptance:
  - [ ] git status --short exit 0
  - [ ] /tmp/git-status-short.txt 生成済み
  - [ ] 読み取り可能 (`wc -l /tmp/git-status-short.txt` 成功)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
