## Description (subtask of 1515-autonomous-stalled-dirty-skip)

CLAUDE.md の Decomposition Priority 1 の export 担当部分を切り出す。Subtask 1 とは
  独立した別領域(snapshot ≠ export)なので並列で進められる。

  手順:
  1. GraphViewContainer.ts を精読し、エクスポート関連メソッドを特定する
     (exportPNG / exportSVG / exportJSON / downloadGraphAs 等の名称を grep し、
     samples/ の preset 出力ロジックも含むなら範囲を判断)。
  2. 純粋関数として抽出可能な部分(SVG 文字列生成、JSON 直列化、ファイル名生成など、
     DOM/Blob 直接操作を含まない部分)を src/views/export/graph-exporter.ts に移動。
     ダウンロードトリガ(URL.createObjectURL / a.click 等)は GraphViewContainer.ts に残す。
  3. tests/views/graph-exporter.test.ts に最低5ケースのユニットテスト
     (空グラフ JSON / 通常 JSON / SVG ヘッダ / SVG ノード描画 / ファイル名 sanitize)。
  4. Subtask 1 と同じく GraphViewContainer.ts の行数が純減し、Max 8655 を超えないこと。
  5. pnpm test, pnpm lint, pnpm format:check を通す。

  禁止事項: snapshot ロジックには触れない(Subtask 1 とのコンフリクト回避)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
