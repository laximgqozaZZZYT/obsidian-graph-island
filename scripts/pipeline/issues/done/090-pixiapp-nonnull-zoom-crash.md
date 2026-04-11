---
priority: high
reported: 2026-04-11
status: done
source: kaizen
summary: zoomToScreenRect 等で pixiApp! を null チェックなしに使用し、view 破棄中にクラッシュする
---
## Description
`src/views/GraphViewContainer.ts` の複数のズーム関数で `this.pixiApp!.stage` を
`world` / `wrap` のガード後に使用しているが、`this.pixiApp` の null チェックがない。

`destroyPixi()` は `this.pixiApp = null` に設定するため、タブ閉鎖中に
marquee zoom やホイールズームのコールバックが実行されると null 参照でクラッシュする。

該当箇所:
- `GraphViewContainer.ts:5787` — `zoomToScreenRect`: `const stage = this.pixiApp!.stage`
- `GraphViewContainer.ts:5812` — `zoomBy`: `this.pixiApp!.stage`
- `GraphViewContainer.ts:5854` — `setZoom`: `this.pixiApp!.stage`
- `GraphViewContainer.ts:5877` — `_applyZoomImmediate`: `this.pixiApp!.stage`

いずれも `if (!world || !wrap) return;` のガードはあるが `pixiApp` は含まれていない。

## Acceptance criteria
- [ ] 上記4関数のガード条件に `!this.pixiApp` を追加する
- [ ] `pixiApp` が null の場合は早期 return する
- [ ] 既存のズーム関連テストが引き続きパスする
