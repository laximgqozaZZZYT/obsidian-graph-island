---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 845-837-git-status
depends: none
summary: git status の before スナップショット取得
---

## Description (subtask of 845-837-git-status)

1. `git status --short > /tmp/git-status-853-before.txt` を実行して作業開始前の状態を保存
2. 生成された `/tmp/git-status-853-before.txt` の行数と内容サマリを出力に記録
3. パスにタスク ID を埋め込むことで、cron 並列実行（3時間毎 `autonomous-improve.sh`）での衝突を回避

priority は親タスク 845-837-git-status（high）を継承。

## Acceptance criteria
- [ ] `test -r /tmp/git-status-853-before.txt` が真（ファイル生成済み・読み取り可能）
- [ ] CLAUDE.md のルールに違反しないこと
