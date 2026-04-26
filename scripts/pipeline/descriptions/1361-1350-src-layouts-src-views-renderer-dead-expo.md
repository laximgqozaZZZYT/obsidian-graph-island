## Description (subtask of 1350-dead-exports)

対象は `src/layouts/`、`src/views/renderer-factory.ts`、`src/views/renderer-canvas2d.ts`、
  `src/views/renderer-webgl.ts`、`src/views/CanvasGraphics.ts`、`src/views/CanvasText.ts`。
  作業手順:
  1. `npx ts-prune -p tsconfig.json` を再実行し、subtask-1 の変更後の残存
     dead exports を抽出する。上記ディレクトリ/ファイルにあるものだけを対象にする。
  2. 各 export を `grep -rn "from.*<モジュールパス>" src/ tests/` で確認。
     特に layouts は GraphViewContainer.ts から動的に呼ばれていることがあるので、
     `_runLayout` 系の switch/case や ViewMode マッピングも確認する。
  3. tests/layouts/ から import されているものは消さず、純粋なヘルパーで未使用な
     ものだけを削除する。型定義 (interface/type) で未使用なものも対象。
  4. 削除後 `pnpm test`, `pnpm lint`, `pnpm build` が通ることを確認。
  禁止: GraphViewContainer.ts / EdgeRenderer.ts / RenderPipeline.ts /
  PanelBuilder.ts (God Object 4ファイル) には触らない。これらの内部 export 削除は
  別タスクで行う。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
