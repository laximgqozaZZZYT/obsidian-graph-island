---
priority: low
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 961-951-tasks-760-730-git-status-short-modified
depends: none
summary: tasks/760-730-git-status-short-modified.md の status と Acceptance を done 化
---

## Description (subtask of 961-951-tasks-760-730-git-status-short-modified)

対象ファイル: tasks/760-730-git-status-short-modified.md のみ。他ファイル変更禁止。God Object ファイル変更禁止。

手順:
1. Read ツールで tasks/760-730-git-status-short-modified.md の全文を読み、frontmatter の status 値と Acceptance セクションのチェックボックス状態を確認
2. frontmatter に `status: decomposed` がある場合のみ Edit で `status: done` に変更 (ユニーク1箇所)。既に `status: done` 等なら frontmatter 変更はスキップ
3. Acceptance criteria セクションの `- [ ]` を `- [x]` に変換
   - Acceptance 以外に `- [ ]` が存在しないと Read 結果で確認できた場合のみ replace_all=true 使用可
   - Description 等にも `- [ ]` が存在する場合は、Acceptance 行ごとにセクション境界込みの old_string で個別 Edit
4. Read ツールで同ファイルを再読込し、status と Acceptance 全チェックボックスが反映されていることを確認

注意:
- pnpm lint / pnpm test 実行不要 (マークダウンのみの変更)
- `status: decomposed` が存在しない場合は no-op として Acceptance のみ処理して終了
- 既に `status: done` + 全 `- [x]` 状態なら全手順 no-op で正常終了

## Acceptance criteria
- [ ] tasks/760-730-git-status-short-modified.md の frontmatter が `status: done` (既に done なら維持)
- [ ] 同ファイルの Acceptance criteria セクションの全チェックボックスが `- [x]`
- [ ] 他ファイルに一切の変更がない
