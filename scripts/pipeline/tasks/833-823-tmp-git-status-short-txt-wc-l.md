---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 823-811-git-status-short-tmp-git-status-short-tx
depends: subtask-1
summary: /tmp/git-status-short.txt の可読性を wc -l で検証
---

## Description (subtask of 823-811-git-status-short-tmp-git-status-short-tx)

- `wc -l /tmp/git-status-short.txt` を実行し、exit code 0 かつ行数が取得できることを確認
  - 失敗した場合はエラーメッセージをそのままログに残して終了
  - state 変更コマンド禁止。新規ファイル作成は /tmp/ 配下のみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
