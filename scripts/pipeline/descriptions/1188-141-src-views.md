
## Description (subtask of 141-coverage-drop)

src/views/ 配下で既に export されている純粋関数 (例: LabelManager の
  smartTruncateLabel, EdgeRenderer から export された resolveEdgeStyle /
  getDashPattern / computeDensityScale / screenToWorld 等) で、
  カバレッジレポート上まだ未カバーの分岐があるものを洗い出し、
  10〜15 件のテストを追加する。
  God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts 本体 /
  RenderPipeline.ts) のクラスメソッドへの新規テストは禁止。
  既に export 済みの純粋関数のみ対象。
  `pnpm test` で全件 PASS 確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
