
## Description (subtask of 133-type-assertions)

4ファイル合計26箇所の `as` を以下で置換:
  - Obsidian API (`TFile`, `MarkdownView`, `CachedMetadata`) → `instanceof` / `in` 型ガードに置換
  - 自前の `LayoutParams` / `PixiNode` → 関数引数/戻り値の型シグネチャを修正してキャスト不要化
  - イベント（MouseEvent/PointerEvent）→ 関数引数型を `PointerEvent` に正しく宣言
  - god object (GraphViewContainer) には触れない。各ファイル内で完結させる
  - 検証: `pnpm test`, `pnpm lint`, CDP で export/interaction/layout 動作確認
  - 期待削減: 約22箇所

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
