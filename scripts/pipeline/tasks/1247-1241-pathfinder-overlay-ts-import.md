---
priority: high
reported: 2026-04-25
status: blocked
source: decomposed
parent: 1241-1237-pathfinder-overlay-ts-pathfinder-import
depends: none
summary: pathfinder-overlay.ts のインラインリテラル出現箇所を精読して置換候補リストを作成し、import 文を追加する
---

## Description (subtask of 1241-1237-pathfinder-overlay-ts-pathfinder-import)

1. `src/constants.ts` を Read し、PATHFINDER_ プレフィックスの定数名と値を全列挙する。
  2. `src/views/pathfinder-overlay.ts` を Read で全文精読し、上記定数値と一致する数値リテラル出現箇所（行番号・前後文脈）を列挙する。
  3. 列挙結果のうち、明らかに別意味の数値（配列 index, tau 分数係数, zoom/LOD/密度関連）は除外する。
  4. ファイル冒頭に `import { <使用する定数のみ> } from '../constants';` を追加する。未使用定数は import に含めない。
  5. この subtask では置換本体は行わない（import 追加とリテラル候補の特定までで完了）。
  6. 禁止ファイルに触らない: `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/node-decorations.ts`。
  7. 変更をコミットする。コミットメッセージ例: `refactor(pathfinder-overlay): add PATHFINDER_* constant imports`。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
