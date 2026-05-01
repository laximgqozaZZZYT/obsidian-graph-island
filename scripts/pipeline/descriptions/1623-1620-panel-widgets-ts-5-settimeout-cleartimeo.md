## Description (subtask of 1620-settimeout-leaks)

`src/views/panel-widgets.ts` の 5 箇所の生 `setTimeout(...)` を、
  closure 内に保持したハンドルと明示的な `clearTimeout(handle)` の対で囲む。
  既存の動作 (UX) は完全に維持する。

  対象箇所と変更内容:
    - 209 行 (autocomplete blur ポップアップ非表示 150ms): `attachAutocomplete()`
      内で `let blurTimer: number | undefined;` を追加。focus ハンドラ冒頭で
      `if (blurTimer !== undefined) { clearTimeout(blurTimer); blurTimer = undefined; }`、
      blur で `blurTimer = window.setTimeout(...);` に。
    - 862 行 (attachQueryHint blur dismiss 150ms): 同パターン。`hide` 関数の中で
      handle を closure に保持、`show`/`rebuildHint` 経路で clearTimeout。
    - 1069 行 (attachFixedHint blur dismiss 150ms): 同パターン。`focus` 経路で
      clearTimeout。
    - 1226 行 (attachSearchJump input 後 50ms rebuild): 同パターン。次の input
      イベントで前回ハンドルを clearTimeout してから再 setTimeout (debounce 化)。
    - 1260 行 (attachSearchJump blur dismiss 200ms): 同パターン。focus または
      keydown 経路で clearTimeout。

  全箇所で `setTimeout(` の出現は維持しつつ `clearTimeout(` を 5 箇所増やすので、
  パイプラインゲートは LEAK 計算上 -5 される。

  `tests/views/panel-widgets-timer.test.ts` を新規作成 (既存テストファイル無し
  なら) し、attachAutocomplete と attachSearchJump について focus→blur→focus
  の連続発火で setTimeout コールバックが発火しないことを vi.useFakeTimers で
  検証 (3-4 件)。テスト用に `tests/__mocks__/obsidian.ts` 既存モック範囲のみ使用。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
