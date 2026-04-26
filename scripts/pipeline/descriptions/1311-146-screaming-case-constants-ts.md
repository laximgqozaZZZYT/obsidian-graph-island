## Description (subtask of 146-scattered-constants)

下記 6 ファイルでファイル内/関数内に直接書かれている `^(export )?const [A-Z][A-Z0-9_]+ [:=]` 形式の定数を
  `src/constants.ts` の末尾に移動し、各ファイルからは `import { ... } from "../constants"` で参照する形に書き換える。
  対象実測件数(grep): EnclosureRenderer 23, DiffOverlay 15, node-decorations 11, card-renderer 10, Minimap 9, render-pipeline-utils 7。
  ルール:
  - 1ファイル内のローカルな定数(他から参照されない描画ヘルパー定数)も、命名がモジュール跨ぎの設定値なら集約。純粋にローカルな計算用一時定数(=小文字 camelCase) は対象外。
  - constants.ts では既存のセクションコメント(`// === Render thresholds ===` 等)に揃え、同じ意味グループに追記。重複/同名の場合は constants.ts 側を真とし、移動元を削除。
  - `pnpm lint` `pnpm build` `pnpm test` がグリーンであること。
  - GOD OBJECT 4 ファイル(GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts)を**増やさない**こと。逆に行が減るのは可。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
