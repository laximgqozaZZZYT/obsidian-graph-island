---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 137-uncancellable-raf-chains
depends: subtask-1
summary: _fadeNodeAlpha をノード別キャンセル可能 fade に置換+onClose全cancel
---

## Description (subtask of 137-uncancellable-raf-chains)

`src/views/GraphViewContainer.ts:7968-7981` の `_fadeNodeAlpha` を修正:
  - インスタンスフィールド `private _fadeHandles: Map<string, RAFHandle> = new Map()` 追加 (キーは `pn.id` or filePath)
  - `_fadeNodeAlpha` 実装を `fadeNodeAlphaCancellable(pn, targetAlpha, duration, this._fadeHandles, pn.id)` 呼び出しに差し替え
  - 同じノードへの再呼び出し時、内部で前回 handle を cancel してから新規開始 (subtask-1のAPIが担保)
  - `onClose()` で `cancelAllHandles(new Set(this._fadeHandles.values())); this._fadeHandles.clear();` を追加
  - `destroyPixi()` 直前にもfade全cancelを実行し、破棄済み `pn.gfx` へのアクセスを防止
  - 既存の search filter 適用パスの挙動が変わらないこと (最終 alpha 値は同一) をコメントなしで保証

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
