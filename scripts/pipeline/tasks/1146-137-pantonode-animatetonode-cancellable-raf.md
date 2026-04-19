---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 137-uncancellable-raf-chains
depends: subtask-1
summary: panToNode/_animateToNode を cancellable rAF に置換+onClose cancel
---

## Description (subtask of 137-uncancellable-raf-chains)

`src/views/GraphViewContainer.ts:7744-7753` の `panToNode` と `:7950-7964` の `_animateToNode` を修正:
  - インスタンスフィールド `private _panRafHandle: RAFHandle | null = null` を追加
  - `panToNode` 内の匿名animate関数を `startCancellableRAF` でラップし、開始前に `this._panRafHandle?.cancel()` で前回中止、新ハンドルを格納
  - `_animateToNode` 同様に処理、同じ `_panRafHandle` を共有 (pan系は同時1本)
  - `onClose()` で `this._panRafHandle?.cancel(); this._panRafHandle = null;` を追加
  - `setHighlightedNodeId`/`applyHover`/`markDirty` コールバック内で `this.app?.workspace` 等の破棄チェックを入れる (既存パターン踏襲)
  - インポート文に animation-controller を追加
  - GOD OBJECT行数を大きく増やさないよう、既存animate関数の中身を controller 呼び出しに置換 (差分は±10行以内目標)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
