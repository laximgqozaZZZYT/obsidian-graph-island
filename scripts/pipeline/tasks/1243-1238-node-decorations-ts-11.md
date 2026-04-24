---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1238-1235-constants-ts-node-deco-11
depends: none
summary: node-decorations.ts を精読しインライン数値リテラルを11個特定する
---

## Description (subtask of 1238-1235-constants-ts-node-deco-11)

1. `src/views/node-decorations.ts` を Read ツールで全文読み、バッジ/リング/ラベル/アイコン/ハロー等の描画パラメータとして使われているインライン数値リテラル (例: 半径, 太さ, オフセット, パディング, フォントサイズ, alpha 値) を列挙する。
  2. ズーム/LOD/密度スケール系 (`1 / zoom`, `lodLevel` 由来, `density` 由来の乗数) は候補から除外する。
  3. 11 個程度に絞り込み、各リテラルについて以下を記録したメモを `src/views/node-decorations.ts` のファイル冒頭 (import 直下) に一時的な `// TODO(NODE_DECO): <定数候補名> = <値>  // <描画要素の説明>` コメント 11 行として追加する (subtask-2 の入力メモとして使用する)。ロジックや既存の数値は触らない。
  4. `pnpm build` で型エラーがないことを確認してコミットする。
  5. 禁止: `src/constants.ts`, `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/pathfinder-overlay.ts` を変更しない。node-decorations.ts の既存実装ロジックも変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
