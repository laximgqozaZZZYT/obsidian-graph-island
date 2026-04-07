---
priority: high
reported: 2026-04-06
status: decomposed
summary: ノート間のインライン関係記法 [[note|alias]@relation] のパースとグラフ表示
---

## Description
ユーザーがノート内に書いたインライン記法から、ノート間の「明示的な関係」を抽出し、それを既存のグラフに追加表示できるようにする。

### 既存機能との区別
- 既存の「タグ間の継承関係」「has-tag」「リンク」などとは**別系統**の edge type として扱う。
- これは「ユーザーが手動で意味づけした関係（named relation）」である。

### 入力記法
ノートMarkdown中に以下の形式で出現する:

```
[[ノート名|表示テキスト]@関係名]
```

例:
- `[[キャラA|Aさん]@親]`
- `[[Episode 12|第12話]@続編]`
- `[[Setting X]@由来]` （表示テキスト省略可）

注意点:
- 通常の `[[note|alias]]` wikilink を壊さないこと
- 関係名は任意の文字列（日本語OK）
- 同じ note に複数の異なる関係でリンクされる可能性あり

### 表示
- 新しい edge type `named-relation`（または同等）として graph data に追加
- edge に `relationName` フィールドを保持
- レンダリング時にラベルとして関係名を表示（既存の edge label 機構を流用可）
- グラフ設定パネルで **表示の有効/無効を切り替え可能** にすること（既存の showLinks 等と同じUI流儀）

## Acceptance criteria
- [ ] `src/parsers/metadata-parser.ts` 周辺で `[[...|...]@rel]` 記法をパースする関数を追加
- [ ] パース結果を edge として `buildGraphFromVault()` の出力に統合（type: `named-relation`）
- [ ] 通常の wikilink パースが壊れていないことをテストで保証
- [ ] 関係名にマルチバイト文字（日本語）が含まれてもパースできる
- [ ] グラフ設定パネル (`PanelBuilder.ts` 関連) に `showNamedRelations` トグルを追加し、デフォルト値を i18n / settings に登録
- [ ] `getGraphData()` のフィルタパイプラインで `showNamedRelations=false` のとき named-relation edge を除外
- [ ] `EdgeRenderer.ts` の `shouldSkipEdge()` で named-relation を扱う
- [ ] edge ラベルとして `relationName` を表示（既存の edge label 機構を流用）
- [ ] 単体テスト: パーサーのケース（標準/別名省略/日本語/複数関係/wikilink共存/誤記）
- [ ] 単体テスト: getGraphData フィルタで showNamedRelations トグルが反映される
