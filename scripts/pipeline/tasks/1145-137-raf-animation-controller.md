---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 137-uncancellable-raf-chains
depends: none
summary: rAFキャンセル対応のanimation-controller新規モジュール作成
---

## Description (subtask of 137-uncancellable-raf-chains)

GraphViewContainer (8580行=Max) を肥大化させないため、rAF制御を独立ファイルに切り出す。
  - `src/views/animation-controller.ts` を新規作成
  - export: `startCancellableRAF(step: (t:number)=>boolean): {cancel:()=>void}` — stepがfalse返すかcancel呼び出しで停止
  - export: `RAFHandle` type ({ cancel: () => void })
  - export: `cancelAllHandles(handles: Set<RAFHandle>): void` — 全ハンドルをcancel+クリア
  - export: `fadeNodeAlphaCancellable(node: PixiNode, targetAlpha: number, durationMs: number, activeMap: Map<string, RAFHandle>, nodeKey: string): RAFHandle` — 同一nodeKeyの既存fadeをcancel後に新規開始、完了時にactiveMapから削除
  - 全関数pure/副作用最小化、requestAnimationFrame/cancelAnimationFrameはパラメータ化可能にし、テストでmock注入
  - `tests/views/animation-controller.test.ts` で以下カバー: cancel後step呼ばれない / stepがfalse返すと自動停止 / fadeNodeAlphaCancellable 同一キー上書き / activeMap掃除 / cancelAllHandles空化

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
