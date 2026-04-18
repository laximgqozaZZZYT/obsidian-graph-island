---
priority: high
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 769-760-git-status-short
depends: none
summary: git status --short を実行し生出力を取得してファイルに保存
---

## Description (subtask of 769-760-git-status-short)

read-only タスク。実装コードは不要で、パイプライン側で以下を実行:

  1. `cd /home/ubuntu/obsidian-plugins/obsidian-graph-island && git status --short > /tmp/git-status-short.txt 2>&1; echo "EXIT=$?"`
  2. exit code が 0 であることを確認。非0の場合は即エラー報告して終了
  3. /tmp/git-status-short.txt の内容 (改行区切りの行リスト) を次サブタスク (760-730 の subtask 2) に受け渡し
  4. git mv / git add / git commit は絶対に実行しない (read-only 保証)
  5. 既存コードは変更しない (src/ 以下触らない)

  Acceptance:
  - [ ] git status --short が exit 0 で完了
  - [ ] 生出力 (stdout) が次サブタスクに渡せる形で保持されている
  - [ ] repository state が変更されていない (git diff が空)
  - [ ] CLAUDE.md ルール遵守 (god object 非肥大化・coverage 非低下・どちらも N/A)

`★ Insight ─────────────────────────────────────`
このタスクは「データキャプチャ段階」で、後続サブタスクが消費する生データを準備する役割です。ファイル書き出し/変数保持どちらでもよいが、パイプライン間受け渡しを考えると一時ファイル経由が最も確実です。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
