---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 116-scattered-constants
depends: subtask-1
summary: src/views/ 配下の描画系定数を constants.ts に集約 (バッチ1: ~80個)
---

## Description (subtask of 116-scattered-constants)

src/views/ 配下から色・サイズ・透明度などの純粋な数値/文字列定数を抽出。
  - 対象: `DEFAULT_*`, `MIN_*`, `MAX_*`, `*_COLOR`, `*_OPACITY`, `*_RADIUS`, `*_THICKNESS` 等
  - **注意**: god object 4ファイル (GraphViewContainer.ts 等) は「行数を増やさない」方針。定数を取り除けば行数が減るので、そのファイルからの抽出は積極的に行ってOK
  - `src/constants.ts` に `// === RENDERING ===` セクションを作り、import を元ファイルに追加
  - ロジックやオブジェクトリテラルは移動せず、プリミティブ定数のみ対象
  - pnpm build && pnpm test で緑を確認してコミット
  - 目標: 約80個 (438 → 358)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
