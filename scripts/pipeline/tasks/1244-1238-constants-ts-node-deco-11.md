---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1238-1235-constants-ts-node-deco-11
depends: subtask-1
summary: constants.ts に NODE_DECO_* 定数を11個追加する
---

## Description (subtask of 1238-1235-constants-ts-node-deco-11)

1. subtask-1 で `src/views/node-decorations.ts` 冒頭に残した `// TODO(NODE_DECO): ...` コメント 11 行を入力として使う。
  2. `src/constants.ts` の `// ---- Renderer decorations ----` セクション配下 (subtask-1235 の親タスクで追加済みの `PATHFINDER_*` 群のすぐ下) に、`NODE_DECO_` プレフィクス付きの `export const` を 11 個追加する。命名例: `NODE_DECO_BADGE_RADIUS`, `NODE_DECO_RING_WIDTH`, `NODE_DECO_LABEL_OFFSET_Y`, `NODE_DECO_ICON_SIZE`, `NODE_DECO_LABEL_FONT_SIZE`, `NODE_DECO_LABEL_PADDING`, `NODE_DECO_HALO_ALPHA` 等。名前は描画要素が明確に分かるものを選ぶ。
  3. 各定数に JSDoc コメント 1 行 (どの描画要素のパラメータか) を付ける。
  4. `src/views/node-decorations.ts` の冒頭に追加した `// TODO(NODE_DECO): ...` 11 行を削除する (subtask-1 の一時メモのクリーンアップ)。node-decorations.ts 内の数値リテラル自体の置換は本タスクでは行わない (値の定義のみ)。
  5. `pnpm build` で型エラーがないことを確認する。
  6. 禁止: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/pathfinder-overlay.ts` を変更しない。node-decorations.ts の実装ロジックも変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
