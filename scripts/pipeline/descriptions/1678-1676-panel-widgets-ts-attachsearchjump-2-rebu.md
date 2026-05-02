## Description (subtask of 1676-settimeout-leaks)

src/views/panel-widgets.ts:1102 の `attachSearchJump(input, cb)` 内の以下 2 箇所の bare `setTimeout(...)` を ManagedTimers 経由に置き換える。
    - line 1226: `setTimeout(ctx.rebuild, 50)` (input イベント内、attachQueryHint 後の rebuild 遅延)
    - line 1260: `setTimeout(ctx.dismiss, 200)` (blur ハンドラ内 dismiss 遅延)

  実装方針:
    1. `attachSearchJump(input, cb)` のシグネチャに `timers: ManagedTimers` を追加する (もしくは内部 ctx パラメータに timers フィールドを追加)
    2. line 1226, 1260 を `timers.setTimeout(...)` に変更する
    3. src/views/PanelBuilder.ts の attachSearchJump 呼び出し側で `ctx.timers` を渡す

  注意:
    - subtask-1 で attachQueryHint シグネチャが変わっているため、attachSearchJump の呼び出し近辺で attachQueryHint も呼ばれる場合は両方に timers が渡るよう整合する
    - subtask-1 と同じく PanelBuilder.ts の行数が God Object 上限 (2216 行) を超えないよう確認

  検証:
    - `pnpm build` が通る
    - `pnpm test` が通る
    - `grep -nE "[^.]setTimeout\(" src/views/panel-widgets.ts | wc -l` が subtask-1 完了時点からさらに 2 減る (panel-widgets.ts の bare setTimeout が 0 件になる)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
