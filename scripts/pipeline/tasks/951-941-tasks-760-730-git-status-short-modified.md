---
priority: low
reported: 2026-04-19
status: pending
source: decomposed
parent: 941-934-760-730-status-done-acceptance
depends: none
summary: tasks/760-730-git-status-short-modified.md の status と Acceptance を done 化
---

## Description (subtask of 941-934-760-730-status-done-acceptance)

対象ファイル: tasks/760-730-git-status-short-modified.md のみ。他ファイル変更禁止。God Object ファイル変更禁止。

  手順:
  1. Read ツールで tasks/760-730-git-status-short-modified.md の全文を読む
  2. frontmatter に `status: in-progress` が存在する場合のみ Edit で `status: done` に変更 (ユニーク1箇所)。既に `status: done` 等なら frontmatter 変更はスキップ
  3. Acceptance criteria セクションの `- [ ]` を `- [x]` に変換
     - ファイル全体に `- [ ]` が Acceptance セクション外 (Description 本文等) にも存在する場合は replace_all=true は使わず、Acceptance 行ごとに個別の Edit 呼び出しでセクション境界込みの old_string を指定する
     - Acceptance 以外に `- [ ]` が存在しないことを Read 結果から確認した場合のみ replace_all=true を使用可
  4. Read ツールで同ファイルを再度読み、frontmatter の status と Acceptance の全チェックボックスが `- [x]` に反映されていることを確認

  注意:
  - pnpm lint / pnpm test 実行不要 (マークダウンファイルのみの変更)
  - `status: in-progress` が存在しない場合は no-op として Acceptance のみ処理して終了

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
