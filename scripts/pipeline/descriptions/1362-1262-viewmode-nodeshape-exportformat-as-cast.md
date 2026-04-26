## Description (subtask of 1262-type-assertions)

src/types.ts に以下のユニオン型を定義 (既にあれば export を確認):
    - type ViewMode = "link" | "sunburst" | "search" | "ring" | "onboarding" | "matrix" | "timeline" | "force"
    - type ExportFormat = "PNG" | "JSON" | "Markdown" | "Mermaid"
    - type NodeShape = "circle" | "rect" | "diamond" | "hexagon"
  その上で、各ファイルから次のリテラルキャストを除去 (型推論または変数の型注釈で代替):
    - "as LINK" / "as SUNBURST" / "as SEARCH" / "as RING" / "as ONBOARDING" 等 (全ファイル合計23箇所)
    - "as PNG" / "as JSON" / "as Markdown" / "as Mermaid" (合計28箇所)
    - "as NodeShape" (8箇所)
  例: const mode: ViewMode = "link"; とすればキャスト不要。
  switch文の網羅性チェックは exhaustive check ヘルパで型ガード。
  目標削減: 約 50 箇所 (ViewMode 23 + ExportFormat 28 + NodeShape 8 のうち重複なく削除可能なもの)。
  GraphViewContainer.ts の Max Allowed (8655行) を超えないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
