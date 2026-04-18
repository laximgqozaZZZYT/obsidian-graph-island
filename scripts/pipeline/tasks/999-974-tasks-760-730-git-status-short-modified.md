---
priority: low
reported: 2026-04-19
status: pending
source: decomposed
parent: 974-961-tasks-760-730-git-status-short-modified
depends: none
summary: tasks/760-730-git-status-short-modified.md の status と Acceptance を done 化
---

## Description (subtask of 974-961-tasks-760-730-git-status-short-modified)

対象ファイル: tasks/760-730-git-status-short-modified.md のみ(他ファイル変更禁止)

  手順:
  1. Read で tasks/760-730-git-status-short-modified.md 全文取得
     - frontmatter の status 値を確認
     - Acceptance セクション外に `- [ ]` が存在するか確認
  2. frontmatter status の処理:
     - `status: in-progress` の場合: Edit で `status: done` に変更(old_string はユニーク行)
     - 既に `status: done` 等の場合: スキップ(no-op)
  3. Acceptance criteria セクションのチェックボックス変換:
     - Acceptance 以外に `- [ ]` が存在しない場合: Edit で `- [ ]` → `- [x]` (replace_all=true 可)
     - Description 等にも `- [ ]` が存在する場合: Acceptance 配下の各行を個別 Edit(前後行を含めた old_string でユニーク化)
  4. Read で同ファイルを再読込し検証:
     - frontmatter が `status: done` であること
     - Acceptance criteria 配下の全チェックボックスが `- [x]` であること
     - Description 等の他セクションの `- [ ]` は維持されていること

  制約:
  - pnpm lint / pnpm test 実行不要(マークダウンのみの変更)
  - `status: in-progress` が存在しない場合は Acceptance のみ処理して終了
  - God Object ファイル変更禁止
  - 他ファイル一切変更禁止

  Acceptance:
  - frontmatter が `status: done`(既に done なら維持)
  - Acceptance criteria セクションの全チェックボックスが `- [x]`
  - 他ファイルに変更がない

`★ Insight ─────────────────────────────────────`
- 単一ファイル・マークダウンのみの変更なので 1 サブタスクに留めた(ルール5: 最大5、下限縛りなし)
- frontmatter と Acceptance の2操作は同一ファイル内で原子的に処理したほうが検証コストが低い
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
