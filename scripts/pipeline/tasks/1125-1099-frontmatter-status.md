---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1099-1079-issue-frontmatter-status-done
depends: none
summary: 対象ファイル特定とfrontmatter status確認
---

## Description (subtask of 1099-1079-issue-frontmatter-status-done)

Globで `**/1026-1014-639-626-subtask-status-done*.md` を探索し対象ファイルを1件特定する。
  Readでfrontmatter冒頭10-20行を読み、現在の `status:` 値 (pending or in-progress) とファイルの配置ディレクトリ (pending/ or in-progress/) を確認。
  既に `status: done` なら

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
