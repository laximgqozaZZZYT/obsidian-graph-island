---
priority: high
reported: 2026-04-24
status: decomposed
source: decomposed
parent: 1235-1231-node-decorations-ts-11-constants-ts-node
depends: subtask-1
summary: node-decorations.ts のインラインリテラルを NODE_DECO_ 定数参照に置換
---

## Description (subtask of 1235-1231-node-decorations-ts-11-constants-ts-node)

1. `src/views/node-decorations.ts` の先頭 import 文に `import { NODE_DECO_BADGE_RADIUS, NODE_DECO_RING_WIDTH, ... } from '../constants'` を追加する。既存の `../constants` からの import がある場合はマージする。
  2. subtask-1 で追加した 11 個の定数に対応する箇所のインライン数値リテラルを、対応する `NODE_DECO_*` 定数参照に置き換える。算術式内の数値 (例: `baseRadius + 4`) は意味ある場合のみ置換する (軽微な加算オフセットはそのまま残してよい)。
  3. ファイル行数が増えないこと (CLAUDE.md の GOD OBJECT Policy) を確認する。import 追加で純増する分は、リテラル行との差し引きで ±0〜微減に収めること。
  4. `pnpm test` (vitest) が green であること、`pnpm lint` がエラーなしで通ることを確認する。
  5. `pnpm build` でバンドルサイズが 800KB バジェット内であることを確認する。
  6. 禁止: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/pathfinder-overlay.ts` を変更しない。描画ロジックや関数シグネチャは変更せず、数値リテラル→定数参照の機械的置換のみ行う。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
