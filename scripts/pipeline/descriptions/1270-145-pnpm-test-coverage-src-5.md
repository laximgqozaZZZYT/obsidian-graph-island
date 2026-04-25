## Description (subtask of 145-coverage-drop)

`pnpm test:coverage` を実行して `coverage/coverage-summary.json` を生成する。
  そこから src/ 配下のファイルごとに statements カバレッジが閾値 54.3% を
  下回っているファイル、特に absolute uncovered statements 数が多いファイルを
  上位5件特定する (例: src/parsers/metadata-parser.ts, src/layouts/timeline-layout.ts,
  src/layouts/sunburst.ts, src/layouts/cable-tray.ts, src/layouts/ego-sector.ts のうち
  どれが該当するかを実測で判定)。
  各ファイルについて、export されている純粋関数のうち未テストのものを列挙する。
  god object (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts)
  は対象外。新ファイル作成は禁止。出力は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
