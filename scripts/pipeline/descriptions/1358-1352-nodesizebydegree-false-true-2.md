## Description (subtask of 1352-broken-node-settings-cleanup)

PanelBuilder.ts:470-474 と GraphViewContainer.ts:722-728 にある
  「nodeSizeByDegree が false / undefined なら true に書き換える」
  自動マイグレーションコードを削除する。
  - PanelBuilder.ts:470-474 の if 文ブロックを削除
  - GraphViewContainer.ts:722-728 の if 文ブロックを削除
  - 代わりに types.ts:1592 の DEFAULT_RENDER_THRESHOLDS で
    `nodeSizeByDegree: true` のデフォルトを維持するだけにする
    (undefined フォールバックは LayoutController.ts:122 と
    GraphViewContainer.ts:7087 に既存の `?? true` がある)
  これにより、ユーザーが OFF にした設定が次回ロード時にも保持され、
  nodeSize slider の効果が直接見えるようになる。
  既存の挙動 (新規 panel はデフォルト ON) は DEFAULT_RENDER_THRESHOLDS で維持。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
