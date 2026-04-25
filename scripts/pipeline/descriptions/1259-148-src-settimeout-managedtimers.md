
## Description (subtask of 148-settimeout-leaks)

まず `grep -n "setTimeout\|clearTimeout" src/` を実行して setTimeout 呼び出し箇所を列挙し、対応する clearTimeout があるか file:line 単位で確認する。対応していない setTimeout を未クリア候補として記録する。
  続いて以下の方針で置換する:
  - GraphViewContainer.ts: クラスに private timers = new ManagedTimers() を持たせる。未クリアの window.setTimeout(...) を this.timers.setTimeout(...) に置換する。onClose() / 既存 cleanup メソッド内で this.timers.clearAll() を呼ぶ
  - PanelBuilder.ts: パネル生成/解体で使われている未クリア setTimeout を、呼び出し側 (GraphViewContainer) から渡された ManagedTimers または PanelBuilder 自身が持つインスタンスで置換する。destroy/teardown 経路で clearAll() を呼ぶ
  - main.ts: プラグインレベル (例: registerEvent の外で発火する setTimeout) があれば同様に追跡 → onunload() で clearAll()
  GOD OBJECT 4ファイルの行数は増やさない方針 (純粋な置換のみ)。追加ロジックは

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
