---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 725-714-graphviewcontainer-claude-md-ratchet-617
depends: subtask-3
summary: 対象 issue の frontmatter を in-progress → done へ更新
---

## Description (subtask of 725-714-graphviewcontainer-claude-md-ratchet-617)

`ls issues/pending/617-593-594-585-done-*.md` で対象ファイルを特定し、
  frontmatter を編集する。

  手順:
  1. Glob で `issues/pending/617-593-594-585-done-*.md` を検索
  2. 該当ファイルを Read
  3. frontmatter を Edit:
     - `status: in-progress` → `status: done`
     - `completed: 2026-04-18` の行を追加 (status 行直後)
  4. ファイル移動はまだ行わない (subtask-5 で実施)

  制約:
  - src/ tests/ 配下の編集禁止
  - コミットは作らない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
