---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1095-1075-issues-992-971-subtask-md-status-done
depends: none
summary: issues/992-971-subtask.md の status を in-progress から done に更新してコミット
---

## Description (subtask of 1095-1075-issues-992-971-subtask-md-status-done)

単一ファイルの frontmatter 1行編集タスク。既に atomic な粒度のため分割不可。

  手順:
  1. `Read` で `issues/992-971-subtask.md` を読み、frontmatter 内の `status: in-progress` を確認
  2. `Edit` で `status: in-progress` → `status: done` に置換（frontmatter ブロック内の 1 箇所のみ）
  3. `git diff issues/992-971-subtask.md` で差分が status 行 1 行のみであることを確認
  4. `git diff --stat` で `1 file changed, 1 insertion(+), 1 deletion(-)` を確認
  5. `git add issues/992-971-subtask.md && git commit -m "chore: mark 992-971-subtask as done"`

  制約:
  - 編集対象は `issues/992-971-subtask.md` のみ
  - `src/` および god object 4ファイル（GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts）には触れない
  - 本文および他 frontmatter フィールド（priority / reported / summary / source / parent / depends）は変更しない
  - `git mv` 禁止
  - YAML frontmatter の `---` 区切り 2 本を保持
  - `pnpm test` / `pnpm build` は不要（issues/ はビルド対象外）

  検証:
  - `git diff --stat` が `1 file changed, 1 insertion(+), 1 deletion(-)` であること
  - frontmatter の `---` 区切り 2 本が保持されていること
  - status 行以外に差分がないこと

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
