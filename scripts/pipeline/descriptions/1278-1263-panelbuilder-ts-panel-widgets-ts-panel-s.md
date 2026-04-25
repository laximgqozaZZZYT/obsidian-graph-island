## Description (subtask of 1263-settimeout-leaks)

3ファイルの setTimeout サイト計14件を精読し、未クリアの計10件 (PanelBuilder 4, panel-widgets 5, panel-sections-layout 1) を特定する。
  panel-widgets.ts と panel-sections-layout.ts はパネル側のヘルパー関数モジュールなので、
  setTimeout ハンドルを呼び出し元 (PanelBuilder のインスタンス) に返すか、
  `AbortSignal` ベースのクリーンアップコールバックとして渡すパターンを採用する。
  PanelBuilder 側で `_pendingTimeouts` のような Set を保持し、`destroy()` でまとめてクリアする。
  CLAUDE.md の "PanelBuilder.ts Max 2216行" を超えないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
