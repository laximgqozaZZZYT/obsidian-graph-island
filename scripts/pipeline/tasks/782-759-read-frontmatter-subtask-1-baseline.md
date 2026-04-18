---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 759-730-edit-read-frontmatter
depends: 781-759-subtask
summary: 対象ファイルを Read し frontmatter を subtask-1 baseline と照合 (subtask-2)
---

## Description (subtask of 759-730-edit-read-frontmatter)

1. subtask-1 (781-759-subtask) が保存した baseline `.claude/tasks/730-717-status-done-edit/baseline.json` を読む。
   baseline には frontmatter の期待値 (priority/reported/parent/depends/summary/source/status) が入っている前提。
2. Read ツール相当で対象 .md ファイルを再読込し、frontmatter セクション (先頭 `---` から 2 つ目 `---` まで) を抽出。
3. 以下キーの値が baseline と完全一致するか比較 (大小文字・空白含む):
   - `status` (期待値: `done`)
   - `priority` / `reported` / `parent` / `depends` / `summary` / `source`
4. 不一致があれば ERROR を stdout に出力し、差分 (key, expected, actual) を列挙して exit 1。
5. 全 PASS なら `FRONTMATTER OK` を出力して exit 0。
6. 新規スクリプトは `src/` 配下に置かず CLAUDE.md の God Object には一切触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
