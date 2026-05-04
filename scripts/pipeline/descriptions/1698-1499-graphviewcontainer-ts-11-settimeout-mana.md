## Description (subtask of 1499-settimeout-leaks)

src/views/GraphViewContainer.ts 内で `setTimeout(` を直接呼んでいる 11 箇所を特定し、
  既存の `src/utils/managed-timers.ts` の `ManagedTimers` または
  `src/utils/timer-registry.ts` の `TimerRegistry` 経由に置換する。
  - GraphViewContainer のコンストラクタ/初期化でインスタンスを 1 つ保持
    (例: `private readonly timers = new ManagedTimers()`)
  - 全ての `setTimeout(fn, ms)` を `this.timers.setTimeout(fn, ms)` に置換
  - 既存の `onunload()` / `destroy()` / view close 相当のティアダウンパスで
    `this.timers.clearAll()` を呼ぶ。該当パスが既にあれば 1 行追加するだけ
  - **God Object 制約**: GraphViewContainer.ts は 8652 行 / max 8655 行。
    純粋に in-place 置換 (1 文字単位の差分) のみとし、新規メソッド追加や
    リファクタは禁止。メンバ宣言 1 行 + clearAll 呼び出し 1 行のみ純増可。
  - 完了条件: 当ファイル内 `setTimeout(` の grep ヒット数が 0 になる
    (タイマーは全て `this.timers.setTimeout` 経由)
  - テスト: `pnpm test` が通ることを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
