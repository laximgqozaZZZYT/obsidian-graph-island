---
priority: high
reported: 2026-04-11
status: in-progress
source: kaizen
summary: onClose で annotationLayer.empty() を呼ばずに null 化し、イベントリスナーがリークする
---

## Description

`src/views/GraphViewContainer.ts:1892` で `this.annotationLayer = null` としているが、
その前に `.empty()` を呼んでいない。

`_renderAnnotation()` (行 1747–1834) は各アノテーション DOM 要素に 8 以上のイベントリスナーを登録する:
- `textEl.addEventListener("input", ...)` (行 1759)
- `textEl.addEventListener("pointerdown", ...)` (行 1764)
- `dot.addEventListener("click", ...)` (行 1777, カラー数×N)
- `colorBar.addEventListener("pointerdown", ...)` (行 1786)
- `deleteBtn.addEventListener("click", ...)` (行 1794)
- `el.addEventListener("pointerdown/pointermove/pointerup", ...)` (行 1806–1825)

一方 `_renderAllAnnotations()` (行 1740) では正しく `this.annotationLayer.empty()` を呼んでいる。
`onClose()` だけがこのパターンに従っていない。

**影響**: タブ開閉のたびに 8×N 個のリスナーがリークし、クロージャが破棄済みの
`this.worldContainer`、`this.requestSave()` 等を参照し続ける。メモリ使用量が単調増加する。

同様の問題が `_sunburstTooltipEl` (行 8474–8475 で作成、onClose で未除去) にもある。

## Acceptance criteria

- [ ] `onClose()` で `this.annotationLayer?.empty()` を `null` 代入の前に呼ぶ
- [ ] `onClose()` で `this._sunburstTooltipEl?.remove(); this._sunburstTooltipEl = null;` を追加する
- [ ] 既存テスト (`pnpm test`) がパスする
