---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1015-994-subtask
depends: none
summary: pending → done への git mv と frontmatter status 更新を単一コミットで実施
---

## Description (subtask of 1015-994-subtask)

親 issue の指示に従い、対象 issue ファイルを pending → done へ移動する原子的操作を実施する。

  手順:
  1. `.claude/issues/pending/` 配下の対象 `.md` ファイルを特定（親 issue の参照先を確認）
  2. `git mv .claude/issues/pending/<file>.md .claude/issues/done/<file>.md` で移動
  3. 移動後のファイルの frontmatter `status: decomposed` または `status: decomposed` を `status: done` に書き換え（1行のみ編集）
  4. `git add` + 単一コミット（メッセージ例: `chore: mark <file> as done`）
  5. この subtask 自身のファイルも frontmatter `status: decomposed` → `status: done` に更新し、同コミットまたは追随コミットで done/ へ移動

  制約:
  - ソースコード (`src/`) には一切触れない
  - lint/test/build は不要（docs-only）
  - God Object には影響なし
  - CLAUDE.md の「Forbidden Patterns」に該当する変更を行わない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
