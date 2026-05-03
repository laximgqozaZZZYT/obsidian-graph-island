## Description (subtask of 1676-settimeout-leaks)

src/views/panel-widgets.ts の以下 3 箇所の bare `setTimeout(...)` を、ManagedTimers 経由の呼び出しに置き換える。
    - line 209 (attachAutocomplete 内 input.blur ハンドラ): popup 非表示の 150ms 遅延
    - line 862 (_setupQueryHintListeners 経由 attachQueryHint 内 hide コールバック): hint dismiss の 150ms 遅延
    - line 1069 (addSelect の input.blur ハンドラ): hint dismiss の 150ms 遅延

  実装方針:
    1. `attachAutocomplete(input, suggestions)` のシグネチャに `timers: ManagedTimers` を追加し、内部の bare `setTimeout` を `timers.setTimeout(...)` に変更する
    2. `attachQueryHint(input, getSuggestions)` のシグネチャに `timers: ManagedTimers` を追加し、内部 `_setupQueryHintListeners` 呼び出しに timers を渡し、line 862 の bare `setTimeout` を `timers.setTimeout(...)` に変更する
    3. addSelect 系 (line 1069 を含む関数) のシグネチャにも `timers: ManagedTimers` を追加し、bare `setTimeout` を置き換える
    4. `attachDatalist(input, suggestions)` (line 233) のシグネチャに timers を追加し、内部の attachAutocomplete 呼び出しに渡す
    5. src/views/PanelBuilder.ts の attachQueryHint / attachDatalist / addSelect 呼び出し側 (合計 5+ 箇所、grep で `attachQueryHint(` `attachDatalist(` で確認) で `ctx.timers` を引数として渡す

  検証:
    - `pnpm build` が通る
    - `pnpm test` が通る (panel-widgets 関連の既存テストがあれば破綻しない)
    - `grep -nE "[^.]setTimeout\(" src/views/panel-widgets.ts | wc -l` が現在から 3 減る
    - PanelBuilder.ts は God Object (max 2216 行) を超えない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
