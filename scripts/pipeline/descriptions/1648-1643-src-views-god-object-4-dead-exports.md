## Description (subtask of 1643-dead-exports)

サブタスク1で生成した `.dead-exports.txt` を再生成 (1で削除した分が消える)、
  src/views/ 配下の残りファイル (renderer-factory.ts, LabelManager.ts, CanvasGraphics.ts,
  panel-* 系、view-mode-* 系、その他のヘルパー) を対象に同じ方針で整理する。
  - tests/ から参照される export は残す
  - 完全に未使用のものは export 削除 or シンボル削除
  - god object 4ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts,
    RenderPipeline.ts) からの import が切れる場合は、god object 側の使用箇所も
    内部化を検討するが、行数を減らす方向のみ許可 (Max Allowed の範囲内)。
  pnpm test, pnpm lint, pnpm build を通すこと。
  最終的に `pnpm dlx ts-prune` の出力件数を計測し、目標 (50件以下) に到達したか確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
