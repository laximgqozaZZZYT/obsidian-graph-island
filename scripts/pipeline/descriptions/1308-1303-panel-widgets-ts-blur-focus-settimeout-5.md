## Description (subtask of 1303-settimeout-leaks)

src/views/panel-widgets.ts の 5 件の setTimeout (209, 862, 1069, 1226, 1260 行目)
  はすべて DOM popup の dismiss / hint dismiss / rebuild 用で clearTimeout が 0 件。
  ウィジェット破棄時に未発火タイマーが残る。

  変更内容:
  1. ファイル先頭付近 (export 関数群の外、モジュールスコープ) に
     `const pendingTimers = new Set<ReturnType<typeof setTimeout>>();`
     を追加し、ヘルパー
       function scheduleDismiss(fn: () => void, ms: number): void {
         const id = setTimeout(() => { pendingTimers.delete(id); fn(); }, ms);
         pendingTimers.add(id);
       }
     と
       export function cancelAllPanelWidgetTimers(): void {
         for (const id of pendingTimers) clearTimeout(id);
         pendingTimers.clear();
       }
     を追加。
  2. 既存の 5 箇所の setTimeout を scheduleDismiss(...) に置き換える。
  3. cancelAllPanelWidgetTimers を export し、PanelBuilder の dispose 経路
     (既存の panel teardown コード) から 1 行呼び出しを追加。
     PanelBuilder.ts は god object なので、行を増やさず既存の cleanup 関数に
     1 行差し込むだけにする (cleanup 関数が無い場合は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
