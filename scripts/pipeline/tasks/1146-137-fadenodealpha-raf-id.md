---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 137-uncancellable-raf-chains
depends: subtask-1
summary: _fadeNodeAlpha のノード単位 rAF ID 管理とキャンセル
---

## Description (subtask of 137-uncancellable-raf-chains)

src/views/GraphViewContainer.ts の _fadeNodeAlpha (7968-7981) を修正。
  - PixiNode 型 (src/types.ts もしくは既存定義箇所) に `_fadeRafId?: number | null` フィールドを追加
  - _fadeNodeAlpha 呼び出し開始時に `pn._fadeRafId` が存在すれば `cancelAnimationFrame` でキャンセル
  - 新しい rAF の戻り値を `pn._fadeRafId` に保存
  - fade 完了時に `pn._fadeRafId = null` にリセット
  - onClose() で `this.pixiNodes.forEach(pn => { if (pn._fadeRafId != null) cancelAnimationFrame(pn._fadeRafId); pn._fadeRafId = null; })` を追加
  - animate 内で pn.gfx が destroyed ならearly return
  GOD OBJECT の行数を増やさないこと（既存メソッド内での変更に限定）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
