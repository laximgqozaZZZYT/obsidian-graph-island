---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1095-1075-issues-992-971-subtask-md-status-done
depends: none
summary: issues/992-971-subtask.md の status を done に更新してコミット
---

## Description (subtask of 1095-1075-issues-992-971-subtask-md-status-done)

`issues/992-971-subtask.md` の frontmatter 内 `status: in-progress` を `status: done` に置換する単一編集タスク。

  手順:
  1. `Read` で `issues/992-971-subtask.md` を読み、frontmatter の `status:` 行と他フィールドを確認
  2. `Edit` で `status: in-progress` → `status: done`（frontmatter ブロック内の 1 箇所のみ、`replace_all` は使わない）
  3. `git diff issues/992-971-subtask.md` で変更が 1 行のみであることを確認
  4. `git diff --stat` で `1 file changed, 1 insertion(+), 1 deletion(-)` を確認
  5. `git add issues/992-971-subtask.md && git commit -m "chore: mark 992-971-subtask as done"`

  制約:
  - `git mv` 禁止、ファイル名変更はしない
  - 編集範囲は `issues/992-971-subtask.md` のみ
  - `src/` および god object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) には一切触れない
  - 本文・他 frontmatter フィールド (priority / reported / summary / source / parent / depends) は変更しない
  - `pnpm test` / `pnpm build` は不要 (issues/ はビルド対象外)
  - YAML frontmatter として valid であること (`---` 区切り 2 本を保持)
  - `--no-verify` 禁止、pre-commit hook が失敗した場合は原因を調査

  検証:
  - `git diff --stat` が `1 file changed, 1 insertion(+), 1 deletion(-)` であること
  - frontmatter の `---` 区切り 2 本が保持されていること
  - `status:` 行以外に差分がないこと
  - コミットメッセージが規約通り (`chore:` プレフィックス) であること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
