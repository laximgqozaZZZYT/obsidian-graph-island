---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1021-1013-issue-992-971-subtask-status-done
depends: none
summary: issues/992-971-subtask.md の status を done に更新
---

## Description (subtask of 1021-1013-issue-992-971-subtask-status-done)

`issues/992-971-subtask.md` のフロントマター内 `status: decomposed` 行を
  `status: done` に書き換える単一編集。

  手順:
  1. `Read` で `issues/992-971-subtask.md` を読み、現在の status 行と前後コンテキストを確認
  2. `Edit` で `status: decomposed` を `status: done` に置換（frontmatter ブロック内のみ）
  3. `git diff issues/992-971-subtask.md` で変更が 1 行のみであることを確認
  4. `chore: mark 992-971-subtask as done` でコミット

  制約:
  - `git mv` 禁止（ファイル名変更は別系列タスクの担当）
  - 編集範囲は `issues/` 配下のみ
  - `src/` および god object ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) には一切触れない
  - 本文・他 frontmatter フィールド（priority / reported / summary 等）は変更しない
  - `pnpm test` / `pnpm build` は不要（issues/ はビルド対象外）
  - CLAUDE.md の Forbidden Patterns（coverage 緩和 / god object 肥大化 / magic number）いずれにも抵触しない

  検証:
  - `git diff --stat` が `1 file changed, 1 insertion(+), 1 deletion(-)` であること
  - 変更後も YAML frontmatter として valid（`---` 区切りが破損していない）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
