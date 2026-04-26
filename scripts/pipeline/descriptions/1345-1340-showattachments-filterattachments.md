## Description (subtask of 1340-graph-settings-cleanup)

metadata-parser.ts は getMarkdownFiles() のみ使用するため添付ファイルはノード化されず、
  filterAttachments() は常に no-op となる ghost property。以下を削除する:
  - src/utils/graph-filter.ts: filterAttachments 関数 (43-51行) と FilterOpts.showAttachments
    フィールド (111行)、それを参照する 126行 の分岐を削除。ATTACHMENT_EXTS 定数も
    他参照が無いことを確認した上で削除。
  - src/views/panel-defaults.ts: 34行の showAttachments: false を削除。
  - src/views/PanelBuilder.ts: 112行の型フィールドと 1120/1122行 のトグル UI 行を削除。
  - src/views/GraphViewContainer.ts: 1483行 の "showAttachments" 文字列キー登録、
    6728行 の getGraphData 呼び出し時の showAttachments プロパティ受け渡しを削除。
  - src/utils/presets.ts: 17行 のプリセットキー配列から "showAttachments" を削除。
  - tests/utils/graph-filter.test.ts (および同関数を参照する他テスト) を grep で洗い出して
    該当ケースを削除。
  完了条件: grep -rn "showAttachments\|filterAttachments" src/ tests/ がヒット 0件、
  pnpm test と pnpm build が通ること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
