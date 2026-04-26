## Description (subtask of 1294-settimeout-leaks)

目的: 現状 panel-widgets.ts は setTimeout 5件 / clearTimeout 0件、
  coord-panel.ts は setTimeout 2件 / clearTimeout 0件で、合計 7件が未クリア。
  これを TimerRegistry に移行し、パネル破棄時に clearAll させる。

  作業手順:
  1. GraphViewContainer.ts のコンストラクタまたは onOpen 相当箇所で
     `private panelTimers = new TimerRegistry()` を 1 行追加。
     既存の onClose / destroy 相当のクリーンアップ箇所に
     `this.panelTimers.clearAll()` を 1 行追加。
     (godオブジェクトの増分は最小: import 1 行 + フィールド 1 行 + clearAll 呼び出し 1 行)
  2. panel-widgets.ts と coord-panel.ts のパネル生成関数に
     panelTimers: TimerRegistry を引数として受け渡す。
     既存の setTimeout(...) 呼び出しを panelTimers.set(...) に置換する。
  3. 呼び出し側 (GraphViewContainer.ts のパネル構築箇所) で this.panelTimers を渡す。

  検証:
  - pnpm test で既存ユニットテストが PASS すること
  - 変更後のファイルで `setTimeout(` のヒット数が 0 になること (panel-widgets.ts と coord-panel.ts)

  制約:
  - GraphViewContainer.ts への追加は import + フィールド + clearAll 呼び出しの最小3行のみ
  - 既存の setTimeout が「fire-and-forget で意図的に解放不要」なケースが見つかった場合は
    その旨をコミットメッセージに残し、レジストリ経由には強制しない
  - location.reload() 禁止 ルールは引き続き遵守

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
