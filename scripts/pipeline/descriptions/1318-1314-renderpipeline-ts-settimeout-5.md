## Description (subtask of 1314-settimeout-leaks)

`src/views/RenderPipeline.ts` (god object, max 2476 lines — 増やさないこと) の 7 個ある `setTimeout(` のうち、対応する `clearTimeout` がない 5 個を特定して `TimerRegistry` または `ManagedTimers` に乗せる。
  作業手順:
  1. ファイル全体を読み、各 `setTimeout` 呼び出しの id 保持/解放有無を調査
  2. クラス内に `private readonly _timers = new TimerRegistry()` を1フィールド追加 (既にあれば再利用)
  3. 未管理の 5 件を `this._timers.set(fn, ms)` に置換
  4. `destroy()` 相当の teardown メソッド (なければ `dispose()`) で `this._timers.clearAll()` を呼ぶ
  5. 行数が 2476 を超えていないことを `wc -l src/views/RenderPipeline.ts` で確認 (超えそうなら既存の冗長コードを同時削除して相殺)
  6. `pnpm build` `pnpm lint` `pnpm test` PASS を確認
  新ロジック・新機能追加禁止 (god object policy)。1:1 置換のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
