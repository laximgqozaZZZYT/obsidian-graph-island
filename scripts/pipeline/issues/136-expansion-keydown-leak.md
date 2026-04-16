---
priority: high
reported: 2026-04-16
status: decomposed
source: kaizen
summary: _showNodeExpansionがdocumentのkeydownリスナーを蓄積 — ESCが誤ったハンドラを削除
---
## Description

`GraphViewContainer._showNodeExpansion()` (src/views/GraphViewContainer.ts:3086-3144)
には keydown リスナーの蓄積リークがある。

### 再現シナリオ
1. ノードAをクリック → 展開パネル表示、handler_A を document に登録
2. パネルを閉じずにノードBをクリック
3. line 3087-3088: 古い `.gi-node-expand` DOM要素は除去される
4. **しかし handler_A は document から除去されない**
5. line 3141: `this._expansionKeyHandler` が handler_B で上書き
6. line 3144: handler_B を document に追加

### 結果
- handler_A は document 上に永久に残る（参照が失われているため除去不可能）
- handler_A の `closePanel` クロージャは `this._expansionKeyHandler` を `this` 経由で参照する
- ESC を押すと handler_A が発火し、`this._expansionKeyHandler`（= handler_B）を削除
- handler_B が失われ、新しいパネルの ESC が効かなくなる
- ノードを繰り返しクリックするたびにリスナーが1つずつ蓄積

### 影響
- メモリリーク（リスナー蓄積）
- ESC キーが機能しなくなる（2回目以降）
- onClose() (line 1865-1868) は現在の `_expansionKeyHandler` のみ除去するため、
  蓄積された古いリスナーは view 閉鎖後も document に残る

## Acceptance criteria
- [ ] `_showNodeExpansion` 冒頭で古い `_expansionKeyHandler` を document から除去してから新規登録
- [ ] ノードA→ノードB連続クリック後もESCが正しく機能することを手動検証
- [ ] リスナーが蓄積しないことを確認
