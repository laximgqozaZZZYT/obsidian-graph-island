---
priority: low
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 934-922-760-730-frontmatter-status-acceptance
depends: none
summary: 760-730 タスクファイルの status を done に更新し Acceptance を全件チェック
---

## Description (subtask of 934-922-760-730-frontmatter-status-acceptance)

tasks/760-730-git-status-short-modified.md のみを対象に以下を順次実施する。他ファイル変更禁止。God Object ファイル (GraphViewContainer.ts/PanelBuilder.ts/EdgeRenderer.ts/RenderPipeline.ts) 変更禁止。

  1. Read ツールで tasks/760-730-git-status-short-modified.md の全文を読む
  2. Edit ツールで frontmatter の `status: decomposed` を `status: done` に変更 (ユニーク1箇所)
  3. Edit ツールで Acceptance criteria セクションの `- [ ]` を `- [x]` に replace_all=true で全件置換
  4. Read ツールで同ファイルを再度読み、frontmatter と Acceptance 両方の変更が反映されていることを確認
  5. 変更が1ファイルのみであることを `git status --short` で確認してコミット

  注意:
  - `status: decomposed` が frontmatter に存在しない場合 (既に done 等) は no-op として終了
  - `- [ ]` が Acceptance 以外のセクション (例: Description 本文) にも存在する場合はそちらも変換されうる — その場合は Edit の old_string をセクション境界込みで指定して Acceptance のみに限定する
  - pnpm lint / pnpm test の実行不要 (マークダウンファイルのみの変更)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
