---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 755-729-read-frontmatter
depends: 773-755-read
summary: frontmatter 必須キー存在検証
---

## Description (subtask of 755-729-read-frontmatter)

773-755-read で取得したコンテンツの先頭 `---` ～ `---` ブロックを frontmatter として抽出。
  以下キーがすべて存在するか確認:
  priority / reported / parent / depends / summary / source / status
  欠落キーが1つでもあれば `WARN: missing frontmatter key(s): <keys>` をログ出力し
  サブタスクツリーを abort (exit コード非ゼロ扱い)。コード変更は一切行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
