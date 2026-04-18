---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 755-729-read-frontmatter
depends: none
summary: subtask
---

## Description (subtask of 755-729-read-frontmatter)

で取得したコンテンツの先頭 `---` ～ `---` ブロックを frontmatter として抽出。
  以下キーがすべて存在するか確認:
  priority / reported / parent / depends / summary / source / status
  欠落キーが1つでもあれば `WARN: missing frontmatter key(s): <keys>` をログ出力し
  サブタスクツリーを abort (exit コード非ゼロ扱い)。コード変更は一切行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
