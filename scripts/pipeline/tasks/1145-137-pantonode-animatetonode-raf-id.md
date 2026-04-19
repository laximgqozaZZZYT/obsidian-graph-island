---
priority: high
reported: 2026-04-19
status: blocked
source: decomposed
parent: 137-uncancellable-raf-chains
depends: none
summary: panToNode/_animateToNode の rAF ID 保存とキャンセル対応
---

## Description (subtask of 137-uncancellable-raf-chains)

src/views/GraphViewContainer.ts の panToNode (7744-7753) と _animateToNode (7950-7964) を修正。
  - インスタンス変数 `_panRafId: number | null = null` を追加
  - 両メソッド内の匿名 animate 関数で `requestAnimationFrame` の戻り値を `this._panRafId` に保存
  - animate 開始時に既存の `this._panRafId` があれば `cancelAnimationFrame` でキャンセル
  - アニメーション完了時に `this._panRafId = null` にリセット
  - onClose() に `if (this._panRafId !== null) cancelAnimationFrame(this._panRafId)` を追加
  - view 破棄チェック: animate 内で `this.world` が null/destroyed ならearly return
  既存の pnpm test が全パスすること。GOD OBJECT の行数を増やさないよう、既存行の置換で対応。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
