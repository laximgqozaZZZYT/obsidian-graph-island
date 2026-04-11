---
priority: high
reported: 2026-04-11
status: in-progress
source: kaizen
summary: onClose() で _zoomAnimId の cancelAnimationFrame が漏れている (リソースリーク)
---

## Description

`src/views/GraphViewContainer.ts` の `onClose()` (行1857–1895) で、ズームアニメーション用の
`_zoomAnimId` が `cancelAnimationFrame` されていない。

`_zoomAnimId` は以下2箇所でセットされる:
- 行5868: `_applyZoomAnimated()` — ステップズーム
- 行7879: `autoFitView()` — autoFit アニメーション

各メソッド冒頭では前のアニメをキャンセルしている (行5842, 7855) が、
`onClose()` にはキャンセル処理がない。

一方、同種のリソースは正しく解放されている:
- `orbitAnimId` → `stopOrbitAnimation()` (行1873) で `cancelAnimationFrame`
- `_autoFitTimer` → `clearTimeout` (行1858)
- `_doRenderDebounceTimer` → `clearTimeout` (行1860)
- `_pendingTimers` → 全 `clearTimeout` (行1862)

**影響**: ズームアニメーション実行中にビューを閉じると、破棄済みの `this` 上で
`updateZoomIndicator()` / `markDirty()` が呼ばれ、null参照エラーまたは
孤立したフレームループが発生する。

## Acceptance criteria

- [ ] `onClose()` に `if (this._zoomAnimId) cancelAnimationFrame(this._zoomAnimId);` を追加する (行1858付近、他のタイマークリアと並べる)
- [ ] 既存テスト (`pnpm test`) がパスする
