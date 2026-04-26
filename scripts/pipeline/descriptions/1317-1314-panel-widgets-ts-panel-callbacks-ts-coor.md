## Description (subtask of 1314-settimeout-leaks)

3ファイル合計 8 個の未管理 setTimeout を `src/utils/timer-registry.ts` の `TimerRegistry` (または `src/utils/managed-timers.ts` の `ManagedTimers`) に登録する形に書き換える。
  作業手順:
  1. 各ファイルが属するクラス/モジュールに `private readonly _timers = new TimerRegistry()` を追加 (関数スコープのみのモジュールはコンストラクタ受け取り or オーナークラスから渡す)
  2. `setTimeout(fn, ms)` の呼び出しを `this._timers.set(fn, ms)` に置換 (戻り値の id 利用箇所があれば変数を残す)
  3. オーナークラスの `destroy()` / アンマウント相当のメソッドで `this._timers.clearAll()` を呼ぶ
  4. `pnpm build` と `pnpm test` を実行してリグレッションがないことを確認
  5. `grep -c 'setTimeout(' src/views/panel-widgets.ts src/views/panel-callbacks.ts src/views/coord-panel.ts` が `0` または `clearTimeout` 経由のみになることを確認
  CLAUDE.md の god object policy 対象外ファイルなので行数制約はないが、過剰な追加禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
