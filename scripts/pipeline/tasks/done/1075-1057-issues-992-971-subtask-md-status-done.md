---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1057-1037-issues-992-971-subtask-md-status-done
depends: none
summary: issues/992-971-subtask.md の status を done に更新してコミット
---

## Description (subtask of 1057-1037-issues-992-971-subtask-md-status-done)

`issues/992-971-subtask.md` の frontmatter 内 `status: decomposed` を `status: done` に置換する単一編集タスク。

  手順:
  1. `Read` で `issues/992-971-subtask.md` を読み、frontmatter の status 行を確認
  2. `Edit` で `status: decomposed` → `status: done`（frontmatter ブロック内のみ、1 箇所）
  3. `git diff issues/992-971-subtask.md` で変更が 1 行のみであることを確認
  4. `git diff --stat` で `1 file changed, 1 insertion(+), 1 deletion(-)` を確認
  5. `git add issues/992-971-subtask.md` && `git commit -m "chore: mark 992-971-subtask as done"`

  制約:
  - `git mv` 禁止（ファイル名変更は別タスク担当）
  - 編集範囲は `issues/` 配下のみ
  - `src/` および god object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) には触れない
  - 本文・他 frontmatter フィールド（priority / reported / summary / source / parent / depends）は変更しない
  - `pnpm test` / `pnpm build` 不要（issues/ はビルド対象外）
  - YAML frontmatter として valid（`---` 区切りを破損させない）

  検証:
  - `git diff --stat` が `1 file changed, 1 insertion(+), 1 deletion(-)`
  - frontmatter の `---` 区切り 2 本が保持されている

  注: 元 issue は 1 行編集 + 1 コミットで完結する最小粒度のため、これ以上の分解は不要。1 サブタスクに集約。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
