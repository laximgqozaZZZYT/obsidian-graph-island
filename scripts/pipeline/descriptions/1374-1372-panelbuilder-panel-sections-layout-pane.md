## Description (subtask of 1372-settimeout-leaks)

PanelBuilder.ts(6) / panel-sections-layout.ts(7) / panel-widgets.ts(5) / coord-panel.ts(2) /
  panel-callbacks.ts(1) の生setTimeoutを精読し、debounce/再描画スケジュール用途のものを
  src/utils/timer-registry.ts の TimerRegistry または ManagedTimers 経由に移行する。
  - パネル側はパネル破棄時に clearAll() を呼べるよう、各ファイルで registry の owner を
    特定する(既存の panel destroy hook があるか先に grep)。
  - 無ければ panel-callbacks.ts などのexposeされた teardown 関数に clearAll() を追加。
  - PanelBuilder.ts は Max Allowed 2216行を超えないこと(置換のみ、行数を増やさない)。
  - 既存のキー名前付き debounce(同キー再呼び出しで前回キャンセル)を期待している箇所が
    あれば、そのままパターンを保ち、handle変数を保持して clear→reset するように直す。
  - pnpm test 緑、pnpm lint 緑を確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
