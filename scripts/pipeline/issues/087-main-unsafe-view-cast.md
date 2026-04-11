---
priority: high
reported: 2026-04-11
status: pending
source: kaizen
summary: main.ts のコマンドハンドラが getLeavesOfType 結果を検証なしに GraphViewContainer へキャスト
---
## Description

`src/main.ts` の複数コマンドハンドラで `getLeavesOfType(VIEW_TYPE_GRAPH)` の結果を
検証なしに `GraphViewContainer` へキャストしている。

`VIEW_TYPE_GRAPH = "graph-view"` は Obsidian 組み込みグラフと同一 type ID のため、
`getLeavesOfType()` は組み込みビュー + Graph Island ビューの両方を返す。
`leaves[0]` が組み込みビューの場合、存在しないメソッド呼び出しでランタイムクラッシュする。

**該当箇所:**
- `src/main.ts:77` — `leaves[0].view as GraphViewContainer` → `embedGraphInNote()` 呼び出し
- `src/main.ts:87` — `getLeavesOfType(...)[0]?.view as GraphViewContainer` → `applyPresetByKey("explore")`
- `src/main.ts:97` — 同上 → `applyPresetByKey("analyze")`
- `src/main.ts:107` — 同上 → `applyPresetByKey("write")`

E2E テストの `cdp-e2e.spec.ts` では `"pixiNodes" in l.view` フィルタを使って
Graph Island ビューを正しく識別しているが、本体コードには適用されていない。

**再現シナリオ:** Obsidian 組み込みグラフビューが開いた状態で Graph Island コマンドを実行

## Acceptance criteria
- [ ] `getLeavesOfType()` 結果を `asGraphView()` または `"pixiNodes" in view` で検証してからキャストする
- [ ] 全 4 箇所（line 77, 87, 97, 107）で修正する
- [ ] 組み込みグラフビューのみ表示時に適切なフォールバック（toast 通知など）を行う
