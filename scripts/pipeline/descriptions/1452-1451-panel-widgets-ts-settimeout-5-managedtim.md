## Description (subtask of 1451-settimeout-leaks)

src/views/panel-widgets.ts には clearTimeout が 0件、生 setTimeout が 5件あり、
  プラグイン破棄時にコールバックが解放されない。

  作業内容:
  1. panel-widgets.ts 内の各ウィジェット関数のシグネチャ (または ctx 引数) に
     `timers: ManagedTimers` を追加する。`import type { ManagedTimers } from "../utils/managed-timers"` を上部に追加。
  2. ファイル内の 5箇所の `setTimeout(...)` を `timers.setTimeout(...)` に置換 (行参照: 既存ファイルを `grep -n setTimeout` で再確定すること)。
  3. PanelBuilder.ts 側の呼び出し箇所で `this.timers` を渡すよう更新する。
  4. `pnpm lint`、`pnpm test`、`pnpm build` を通す。
  5. GraphViewContainer.ts/PanelBuilder.ts の行数が "Max Allowed" を超えないことを `wc -l` で確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
