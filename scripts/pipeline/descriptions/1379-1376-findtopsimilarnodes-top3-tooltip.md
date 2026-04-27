## Description (subtask of 1376-hover-similar-suggest-top3)

既存のノードホバーハンドラ（GraphViewContainer.ts 内、ホバーtooltip組み立て箇所をGrepで特定すること。"hover" "tooltip" "showHoverInfo" 等で検索）から `findTopSimilarNodes(hoveredNode, currentVisibleNodes, currentVisibleEdges, 3)` を呼び出し、結果を既存の tooltip DOM 末尾に「Similar: <ノード名×3 (score)>」形式で1行追加する。
  制約:
  - GraphViewContainer.ts の純増行数は **30行以内**（CLAUDE.md God Object Policy: Max Allowed 8655 を絶対に超えない）。
  - 新規メソッド追加は禁止。既存ホバーtooltip生成箇所にインライン追記する。
  - 文字列はすべて `t()` 経由（src/i18n.ts に `tooltip.similarHeader` キーを追加し "Similar:" / "類似:" を登録）。
  - スコアは `score.toFixed(2)` で表示。
  - 対応ノードがクリック可能である必要はない（今フェーズはテキスト表示のみ）。
  pnpm test / pnpm lint / pnpm format:check が通ることを確認してコミット。E2E は手動確認不要（後続タスクで検証）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
