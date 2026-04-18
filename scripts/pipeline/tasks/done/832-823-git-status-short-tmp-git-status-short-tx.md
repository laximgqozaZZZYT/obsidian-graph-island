---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 823-811-git-status-short-tmp-git-status-short-tx
depends: none
summary: git status --short を /tmp/git-status-short.txt に保存し exit code を確認
---

## Description (subtask of 823-811-git-status-short-tmp-git-status-short-tx)

作業ディレクトリ /home/ubuntu/obsidian-plugins/obsidian-graph-island で以下を実行:
  - `git status --short > /tmp/git-status-short.txt 2>&1; echo "EXIT=$?"`
  - 標準出力に現れた "EXIT=" の値が "0" であることを確認。非0なら即座に失敗として報告し、以降のタスクを実施しない
  - 禁止: git add/commit/mv/restore/checkout/reset などの state 変更コマンド、src/ 配下への書き込み
  - 成果物: /tmp/git-status-short.txt (生成確認のみ、内容検証は subtask-2 で行う)

## Acceptance criteria
- [ ] `git status --short > /tmp/git-status-short.txt 2>&1; echo "EXIT=$?"` の EXIT が 0
- [ ] `/tmp/git-status-short.txt` が生成済み (stat / ls で存在確認)
- [ ] state 変更コマンド (add/commit/mv/restore/checkout/reset) を一切実行していない
- [ ] src/ 配下に書き込みが発生していない
