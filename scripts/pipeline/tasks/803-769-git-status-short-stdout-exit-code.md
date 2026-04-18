---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 769-760-git-status-short
depends: none
summary: git status --short を実行し stdout/exit code を取得
---

## Description (subtask of 769-760-git-status-short)

Bash tool で以下を実行:
    cwd: /home/ubuntu/obsidian-plugins/obsidian-graph-island
    command: git status --short
  取得項目:
    - stdout (文字列)
    - exit code (整数)
  禁止事項:
    - git mv / git add / git commit / git reset 等の write 系コマンド実行禁止
    - ファイル編集禁止 (Edit/Write tool 使用不可)
  出力フォーマット:
    - stdout の生文字列をそのまま次タスクに渡す (trim しない)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
