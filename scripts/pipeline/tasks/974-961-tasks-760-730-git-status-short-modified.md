---
priority: low
reported: 2026-04-19
status: pending
source: decomposed
parent: 961-951-tasks-760-730-git-status-short-modified
depends: none
summary: tasks/760-730-git-status-short-modified.md の status と Acceptance を done 化
---

## Description (subtask of 961-951-tasks-760-730-git-status-short-modified)

対象ファイル: tasks/760-730-git-status-short-modified.md のみ。他ファイル変更禁止。

  手順:
  1. Read ツールで tasks/760-730-git-status-short-modified.md の全文を読み、frontmatter の status 値と Acceptance セクション外の `- [ ]` 有無を確認
  2. frontmatter に `status: in-progress` がある場合のみ Edit で `status: done` に変更 (ユニーク1箇所)。既に `status: done` 等なら frontmatter 変更はスキップ
  3. Acceptance criteria セクションの `- [ ]` を `- [x]` に変換
     - Acceptance 以外に `- [ ]` が存在しないと Read 結果で確認できた場合のみ replace_all=true 使用可
     - Description 等にも `- [ ]` が存在する場合は、Acceptance 行ごとにセクション境界込みの old_string で個別 Edit
  4. Read ツールで同ファイルを再読込し、status と Acceptance 全チェックボックスが反映されていることを確認

  注意:
  - pnpm lint / pnpm test 実行不要 (マークダウンのみの変更)
  - `status: in-progress` が存在しない場合は no-op として Acceptance のみ処理して終了
  - God Object ファイル変更禁止
  - 他ファイル一切変更禁止

  Acceptance:
  - frontmatter が `status: done` (既に done なら維持)
  - Acceptance criteria セクションの全チェックボックスが `- [x]`
  - 他ファイルに変更がない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
